import {
  GOOGLE_CALENDAR_SOURCE,
  GOOGLE_CALENDAR_TOPICS,
  INTERACTION_TOPICS,
  ToldOnce,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import { notedPrompt, type BusClient } from '@sysdesign/notifications-client';

import { SyncTokenExpired, type CalendarEvent, type CalendarPort } from '../calendar';
import type { WatchSettings } from '../settings';

/**
 * What changes on the calendar, told once: the watcher syncs the calendar
 * from now when the service starts, saying nothing of what was there, then
 * continues from the sync token — each event changed since said on the bus
 * as created, updated or cancelled, an invitation the account has not
 * answered said as one, and the person told of each poll's changes in one
 * notice. One poll runs at a time; the token moves only once everything is
 * told, so a poll that failed midway starts again from the same token and
 * what it had told is remembered and passed over. A token the calendar no
 * longer honours starts the sync again from now.
 */
export interface WatchLog {
  info(line: string): void;
  warn(line: string): void;
}

export type Change =
  | { kind: 'created'; event: CalendarEvent }
  | { kind: 'updated'; event: CalendarEvent }
  | { kind: 'cancelled'; event: CalendarEvent }
  | { kind: 'invitation'; event: CalendarEvent };

const TOPIC_OF = {
  created: GOOGLE_CALENDAR_TOPICS.eventCreated,
  updated: GOOGLE_CALENDAR_TOPICS.eventUpdated,
  cancelled: GOOGLE_CALENDAR_TOPICS.eventCancelled,
  invitation: GOOGLE_CALENDAR_TOPICS.invitationReceived,
} as const satisfies Record<Change['kind'], string>;

const WORD_OF: Record<Change['kind'], string> = {
  created: 'New',
  updated: 'Changed',
  cancelled: 'Cancelled',
  invitation: 'Invitation',
};

/** How many tellings are remembered against a retried poll. */
const TOLD_KEEP = 1_000;

const whenOf = (time: CalendarEvent['start']): string => time.dateTime ?? time.date ?? 'unset';

/** One telling of an event as it stood: the same event changed again is another. */
const keyOf = (event: CalendarEvent): string => `${event.id}@${event.updated ?? ''}`;

/** What a change is, from the event as the sync returned it and when the watcher last looked. */
export function changeOf(event: CalendarEvent, since: Date): Change {
  if (event.status === 'cancelled') return { kind: 'cancelled', event };
  const self = event.attendees.find((attendee) => attendee.self);
  if (self?.responseStatus === 'needsAction' && !(event.organizer?.self ?? false)) {
    return { kind: 'invitation', event };
  }
  const created = event.created === null ? null : Date.parse(event.created);
  return created !== null && created >= since.getTime()
    ? { kind: 'created', event }
    : { kind: 'updated', event };
}

export class ChangeWatcher {
  private syncToken: string | null = null;
  private since: Date;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<Change[]> | null = null;
  private readonly told = new ToldOnce(TOLD_KEEP);

  constructor(
    private readonly calendar: CalendarPort,
    private readonly bus: Pick<BusClient, 'publish'>,
    private readonly settings: WatchSettings,
    private readonly log: WatchLog,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.since = clock();
  }

  /** Syncs from now, telling nothing of what is already there. */
  async start(): Promise<void> {
    if (!this.settings.enabled) return;
    await this.resync();
    this.timer = setInterval(() => {
      void this.poll().catch((error: unknown) => {
        this.log.warn(`calendar watch: ${String(error)}`);
      });
    }, this.settings.pollEveryMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** One poll at a time: a tick that lands while one runs joins it. */
  poll(): Promise<Change[]> {
    if (this.inFlight === null) {
      this.inFlight = this.pollOnce().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /** A full sync from now: every page walked for the token alone. */
  private async resync(): Promise<void> {
    this.since = this.clock();
    let pageToken: string | null = null;
    let token: string | null = null;
    do {
      const page = await this.calendar.sync(this.settings.calendarId, {
        syncToken: null,
        pageToken,
        timeMin: this.since.toISOString(),
      });
      pageToken = page.nextPageToken;
      token = page.nextSyncToken ?? token;
    } while (pageToken !== null);
    this.syncToken = token;
    this.log.info(
      `calendar watch: synced ${this.settings.calendarId} from ${this.since.toISOString()}`,
    );
  }

  /** Every page since the token: the events changed, and the token the next sync continues from. */
  private async changesSince(
    syncToken: string,
  ): Promise<{ changed: CalendarEvent[]; token: string | null }> {
    const changed: CalendarEvent[] = [];
    let token: string | null = null;
    let pageToken: string | null = null;
    do {
      const page = await this.calendar.sync(this.settings.calendarId, {
        syncToken,
        pageToken,
        timeMin: null,
      });
      changed.push(...page.events);
      pageToken = page.nextPageToken;
      token = page.nextSyncToken ?? token;
    } while (pageToken !== null);
    return { changed, token };
  }

  /** What changed since the token, each said on the bus, all told in one notice, then the token moved. */
  private async pollOnce(): Promise<Change[]> {
    if (this.syncToken === null) {
      await this.resync();
      return [];
    }
    let since: { changed: CalendarEvent[]; token: string | null };
    try {
      since = await this.changesSince(this.syncToken);
    } catch (error) {
      if (!(error instanceof SyncTokenExpired)) throw error;
      this.log.warn('calendar watch: the sync token expired; starting again from now');
      await this.resync();
      return [];
    }
    const changes = since.changed
      .filter((event) => !this.told.has(keyOf(event)))
      .map((event) => changeOf(event, this.since));
    for (const change of changes) {
      await this.bus.publish({
        topic: TOPIC_OF[change.kind],
        source: GOOGLE_CALENDAR_SOURCE,
        payload: {
          calendarId: change.event.calendarId,
          eventId: change.event.id,
          summary: change.event.summary,
          start: whenOf(change.event.start),
          end: whenOf(change.event.end),
          ...(change.kind === 'invitation'
            ? { organizer: change.event.organizer?.email ?? '' }
            : {}),
        },
      });
    }
    if (changes.length > 0) {
      await this.bus.publish({
        topic: INTERACTION_TOPICS.prompted,
        source: GOOGLE_CALENDAR_SOURCE,
        payload: this.notice(changes),
      });
    }
    // Only now, with everything told: a poll that threw above starts again from the same token.
    for (const change of changes) this.told.add(keyOf(change.event));
    this.syncToken = since.token ?? this.syncToken;
    this.since = this.clock();
    return changes;
  }

  private notice(changes: readonly Change[]): InteractionPrompt {
    const now = this.clock();
    return notedPrompt({
      origin: { kind: 'calendar-watch', id: this.settings.calendarId, label: 'calendar changes' },
      title: `${changes.length} calendar change${changes.length === 1 ? '' : 's'}`,
      details: changes.map(
        (change) =>
          `${WORD_OF[change.kind]}: ${change.event.summary || '(untitled)'} · ${whenOf(change.event.start)}${
            change.kind === 'invitation'
              ? ` · from ${change.event.organizer?.email ?? 'unknown'}`
              : ''
          } (event ${change.event.id})`,
      ),
      expiresAt: new Date(now.getTime() + this.settings.noticeTtlMs),
    });
  }
}
