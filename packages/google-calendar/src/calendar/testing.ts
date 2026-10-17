/**
 * The calendar in memory, for the specs: calendars and events as plain
 * records, free/busy read off the events, a change log the sync token is a
 * position in. Pure — no vitest import.
 */
import {
  SyncTokenExpired,
  type CalendarEntry,
  type CalendarEvent,
  type CalendarPort,
  type EventDraft,
  type EventPatch,
  type EventTime,
  type EventWindow,
  type FreeBusy,
  type Response,
  type SyncPage,
} from './ports';

export const OWNER = 'owner@example.test';

let minted = 0;
const mint = (prefix: string): string => `${prefix}${++minted}`;

export const sampleEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: mint('e'),
  calendarId: 'primary',
  status: 'confirmed',
  summary: 'Design review',
  description: null,
  location: null,
  start: { dateTime: '2026-10-20T17:00:00.000Z', date: null, timeZone: 'America/Los_Angeles' },
  end: { dateTime: '2026-10-20T17:30:00.000Z', date: null, timeZone: 'America/Los_Angeles' },
  attendees: [],
  organizer: { email: OWNER, displayName: null, self: true },
  htmlLink: null,
  created: '2026-10-01T00:00:00.000Z',
  updated: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

/** How many events one sync page carries here: small, so a spec walks pages. */
const PAGE = 2;

const instantOf = (time: EventTime): number => Date.parse(time.dateTime ?? time.date ?? '');

const within = (event: CalendarEvent, window: EventWindow): boolean =>
  instantOf(event.start) < Date.parse(window.timeMax) &&
  instantOf(event.end) > Date.parse(window.timeMin);

const textOf = (event: CalendarEvent): string =>
  [
    event.summary,
    event.description ?? '',
    event.location ?? '',
    ...event.attendees.map((attendee) => attendee.email),
  ]
    .join(' ')
    .toLowerCase();

export class InMemoryCalendar implements CalendarPort {
  readonly events: CalendarEvent[] = [];
  readonly calendars: CalendarEntry[] = [
    {
      id: 'primary',
      summary: 'Owner',
      primary: true,
      timeZone: 'America/Los_Angeles',
      accessRole: 'owner',
    },
    {
      id: 'team@example.test',
      summary: 'Team',
      primary: false,
      timeZone: null,
      accessRole: 'reader',
    },
  ];
  /** Whose free/busy the account can read, beyond its own calendar. */
  readonly shared = new Set<string>(['primary']);
  /** The sync tokens the calendar no longer honours: a sync from one reads as expired. */
  readonly expiredTokens = new Set<string>();
  /** What the account said when answering an invitation, by event id. */
  readonly comments = new Map<string, string>();
  /** Each change in order, as the id of the event changed; a sync token is a position in it. */
  private readonly changes: string[] = [];

  constructor(
    events: CalendarEvent[] = [],
    private readonly clock: () => Date = () => new Date('2026-10-16T12:00:00.000Z'),
  ) {
    for (const event of events) this.events.push(event);
  }

  /** The token a sync finishing now would hand out. */
  currentSyncToken(): string {
    return String(this.changes.length);
  }

  /** An event changing from outside: put in place, or added, and counted. */
  apply(event: CalendarEvent): void {
    const at = this.events.findIndex((each) => each.id === event.id);
    if (at === -1) this.events.push(event);
    else this.events[at] = event;
    this.changes.push(event.id);
  }

  private find(calendarId: string, id: string): CalendarEvent | null {
    return this.events.find((event) => event.calendarId === calendarId && event.id === id) ?? null;
  }

  listCalendars(): Promise<CalendarEntry[]> {
    return Promise.resolve([...this.calendars]);
  }

  listEvents(
    calendarId: string,
    window: EventWindow,
    query: string | null,
    max: number,
  ): Promise<CalendarEvent[]> {
    const words = (query ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word !== '');
    return Promise.resolve(
      this.events
        .filter(
          (event) =>
            event.calendarId === calendarId &&
            event.status !== 'cancelled' &&
            within(event, window) &&
            words.every((word) => textOf(event).includes(word)),
        )
        .sort((a, b) => instantOf(a.start) - instantOf(b.start))
        .slice(0, max),
    );
  }

  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null> {
    return Promise.resolve(this.find(calendarId, eventId));
  }

  insertEvent(draft: EventDraft): Promise<CalendarEvent> {
    const now = this.clock().toISOString();
    const event: CalendarEvent = {
      id: mint('e'),
      calendarId: draft.calendarId,
      status: 'confirmed',
      summary: draft.summary,
      description: draft.description,
      location: draft.location,
      start: draft.start,
      end: draft.end,
      attendees: draft.attendees.map((email) => ({
        email,
        displayName: null,
        responseStatus: 'needsAction',
        self: email === OWNER,
        organizer: false,
      })),
      organizer: { email: OWNER, displayName: null, self: true },
      htmlLink: null,
      created: now,
      updated: now,
    };
    this.apply(event);
    return Promise.resolve(event);
  }

  patchEvent(calendarId: string, eventId: string, patch: EventPatch): Promise<CalendarEvent> {
    const event = this.find(calendarId, eventId);
    if (event === null) return Promise.reject(new Error(`no event ${eventId}`));
    const changed: CalendarEvent = {
      ...event,
      ...(patch.summary === undefined ? {} : { summary: patch.summary }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.location === undefined ? {} : { location: patch.location }),
      ...(patch.start === undefined ? {} : { start: patch.start }),
      ...(patch.end === undefined ? {} : { end: patch.end }),
      ...(patch.attendees === undefined
        ? {}
        : {
            attendees: patch.attendees.map((email) => ({
              email,
              displayName: null,
              responseStatus: 'needsAction' as const,
              self: email === OWNER,
              organizer: false,
            })),
          }),
      updated: this.clock().toISOString(),
    };
    this.apply(changed);
    return Promise.resolve(changed);
  }

  deleteEvent(calendarId: string, eventId: string): Promise<boolean> {
    const event = this.find(calendarId, eventId);
    if (event === null || event.status === 'cancelled') return Promise.resolve(false);
    this.apply({ ...event, status: 'cancelled', updated: this.clock().toISOString() });
    return Promise.resolve(true);
  }

  respond(
    calendarId: string,
    eventId: string,
    response: Exclude<Response, 'needsAction'>,
    comment: string | null,
  ): Promise<CalendarEvent> {
    const event = this.find(calendarId, eventId);
    if (event === null) return Promise.reject(new Error(`no event ${eventId}`));
    if (comment !== null) this.comments.set(eventId, comment);
    const answered: CalendarEvent = {
      ...event,
      attendees: event.attendees.map((attendee) =>
        attendee.self ? { ...attendee, responseStatus: response } : attendee,
      ),
      updated: this.clock().toISOString(),
    };
    this.apply(answered);
    return Promise.resolve(answered);
  }

  freeBusy(window: EventWindow, calendarIds: readonly string[]): Promise<FreeBusy> {
    const busyOf = (id: string) =>
      this.events
        .filter(
          (event) =>
            event.status === 'confirmed' &&
            event.start.dateTime !== null &&
            event.end.dateTime !== null &&
            (id === 'primary'
              ? event.calendarId === 'primary'
              : event.attendees.some((attendee) => attendee.email === id)) &&
            within(event, window),
        )
        .map((event) => ({ start: event.start.dateTime ?? '', end: event.end.dateTime ?? '' }));
    return Promise.resolve({
      calendars: Object.fromEntries(
        calendarIds.map((id) => [
          id,
          this.shared.has(id)
            ? { busy: busyOf(id), errors: [] }
            : { busy: [], errors: ['notFound'] },
        ]),
      ),
    });
  }

  sync(
    calendarId: string,
    cursor: { syncToken: string | null; pageToken: string | null; timeMin: string | null },
  ): Promise<SyncPage> {
    if (cursor.syncToken !== null && this.expiredTokens.has(cursor.syncToken)) {
      return Promise.reject(new SyncTokenExpired());
    }
    const items =
      cursor.syncToken === null
        ? this.events.filter(
            (event) =>
              event.calendarId === calendarId &&
              (cursor.timeMin === null || instantOf(event.end) > Date.parse(cursor.timeMin)),
          )
        : [...new Set(this.changes.slice(Number(cursor.syncToken)))]
            .map((id) => this.events.find((event) => event.id === id))
            .filter((event): event is CalendarEvent => event?.calendarId === calendarId);
    const offset = cursor.pageToken === null ? 0 : Number(cursor.pageToken);
    const nextPageToken = offset + PAGE < items.length ? String(offset + PAGE) : null;
    return Promise.resolve({
      events: items.slice(offset, offset + PAGE),
      nextPageToken,
      nextSyncToken: nextPageToken === null ? this.currentSyncToken() : null,
    });
  }
}
