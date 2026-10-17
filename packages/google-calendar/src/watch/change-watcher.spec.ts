import {
  GOOGLE_CALENDAR_TOPICS,
  INTERACTION_TOPICS,
  interactionPromptSchema,
} from '@sysdesign/contracts';

import type { SyncPage } from '../calendar';
import { InMemoryCalendar, OWNER, sampleEvent } from '../calendar/testing';
import { ChangeWatcher } from './change-watcher';

const settings = {
  enabled: true,
  pollEveryMs: 120_000,
  noticeTtlMs: 3_600_000,
  calendarId: 'primary',
};
const quiet = { info: () => undefined, warn: () => undefined };

type Published = { topic: string; source: string; payload: unknown };

/** A bus that records every publish and refuses the one numbered `failAt`, once. */
const recordingBus = (failAt: number | null = null) => {
  const published: Published[] = [];
  let failed = false;
  return {
    published,
    publish: (request: Published) => {
      published.push(request);
      if (failAt !== null && !failed && published.length === failAt) {
        failed = true;
        return Promise.reject(new Error('bus down'));
      }
      return Promise.resolve({ seq: '1', ...request, publishedAt: '' });
    },
  };
};

const watching = (calendar: InMemoryCalendar, failAt: number | null = null) => {
  const bus = recordingBus(failAt);
  const watcher = new ChangeWatcher(
    calendar,
    bus,
    settings,
    quiet,
    () => new Date('2026-10-16T12:00:00.000Z'),
  );
  return { watcher, published: bus.published };
};

const NOW = '2026-10-16T12:00:00.000Z';

/** A calendar whose incremental sync answers only when the spec says. */
class SlowCalendar extends InMemoryCalendar {
  release: (() => void) | null = null;
  override sync(
    calendarId: string,
    cursor: { syncToken: string | null; pageToken: string | null; timeMin: string | null },
  ): Promise<SyncPage> {
    const page = super.sync(calendarId, cursor);
    if (cursor.syncToken === null) return page;
    return new Promise((resolve) => {
      this.release = () => resolve(page);
    });
  }
}

describe('the change watcher', () => {
  it('[GCL-6] tells nothing of what was there at the start, says each change since on the bus by its kind, and tells a person of a poll’s changes in one notice', async () => {
    const calendar = new InMemoryCalendar([sampleEvent({ id: 'old' })]);
    const { watcher, published } = watching(calendar);
    await watcher.start();
    expect(await watcher.poll()).toEqual([]);
    expect(published).toEqual([]);

    calendar.apply(sampleEvent({ id: 'new', created: NOW, updated: NOW }));
    calendar.apply(sampleEvent({ id: 'old', summary: 'Design review (moved)' }));
    calendar.apply(
      sampleEvent({
        id: 'inv',
        organizer: { email: 'ada@example.test', displayName: null, self: false },
        attendees: [
          {
            email: OWNER,
            displayName: null,
            responseStatus: 'needsAction',
            self: true,
            organizer: false,
          },
        ],
        created: NOW,
      }),
    );
    calendar.apply(sampleEvent({ id: 'gone', status: 'cancelled' }));
    const changes = await watcher.poll();
    expect(changes.map((change) => [change.kind, change.event.id])).toEqual([
      ['created', 'new'],
      ['updated', 'old'],
      ['invitation', 'inv'],
      ['cancelled', 'gone'],
    ]);
    expect(published.map((event) => event.topic)).toEqual([
      GOOGLE_CALENDAR_TOPICS.eventCreated,
      GOOGLE_CALENDAR_TOPICS.eventUpdated,
      GOOGLE_CALENDAR_TOPICS.invitationReceived,
      GOOGLE_CALENDAR_TOPICS.eventCancelled,
      INTERACTION_TOPICS.prompted,
    ]);
    expect(published[0]).toMatchObject({
      source: 'google-calendar',
      payload: {
        calendarId: 'primary',
        eventId: 'new',
        summary: 'Design review',
        start: '2026-10-20T17:00:00.000Z',
        end: '2026-10-20T17:30:00.000Z',
      },
    });
    expect(published[2]?.payload).toMatchObject({ eventId: 'inv', organizer: 'ada@example.test' });
    const notice = interactionPromptSchema.parse(published[4]?.payload);
    expect(notice.title).toBe('4 calendar changes');
    expect(notice.details).toEqual([
      'New: Design review · 2026-10-20T17:00:00.000Z (event new)',
      'Changed: Design review (moved) · 2026-10-20T17:00:00.000Z (event old)',
      'Invitation: Design review · 2026-10-20T17:00:00.000Z · from ada@example.test (event inv)',
      'Cancelled: Design review · 2026-10-20T17:00:00.000Z (event gone)',
    ]);
    expect(notice.choices.map((choice) => choice.id)).toEqual(['noted']);
    expect(notice.expiresAt).toBe('2026-10-16T13:00:00.000Z');
    // Told once: the next poll finds nothing new.
    expect(await watcher.poll()).toEqual([]);
    expect(published).toHaveLength(5);
    watcher.stop();
  });

  it('[GCL-6] starts again from now when the calendar refuses its token, telling nothing of what it missed, and does not run when the setting says so', async () => {
    const calendar = new InMemoryCalendar();
    const { watcher, published } = watching(calendar);
    await watcher.start();
    calendar.expiredTokens.add(calendar.currentSyncToken());
    calendar.apply(sampleEvent({ id: 'missed', created: NOW }));
    expect(await watcher.poll()).toEqual([]);
    expect(published).toEqual([]);
    calendar.apply(sampleEvent({ id: 'seen', created: NOW }));
    expect((await watcher.poll()).map((change) => change.event.id)).toEqual(['seen']);
    watcher.stop();

    const off = new ChangeWatcher(
      calendar,
      { publish: () => Promise.reject(new Error('never')) },
      { ...settings, enabled: false },
      quiet,
    );
    await off.start();
    off.stop();
  });

  it('[GCL-6] runs one poll at a time: a tick that lands while one runs joins it, and nothing is told twice', async () => {
    const calendar = new SlowCalendar();
    const { watcher, published } = watching(calendar);
    await watcher.start();
    calendar.apply(sampleEvent({ id: 'e1', created: NOW }));
    const first = watcher.poll();
    const second = watcher.poll();
    expect(second).toBe(first);
    calendar.release?.();
    expect((await first).map((change) => change.event.id)).toEqual(['e1']);
    expect(published.map((event) => event.topic)).toEqual([
      GOOGLE_CALENDAR_TOPICS.eventCreated,
      INTERACTION_TOPICS.prompted,
    ]);
  });

  it('[GCL-6] a poll that fails midway starts again from the same token and tells what it had not', async () => {
    const calendar = new InMemoryCalendar();
    const { watcher, published } = watching(calendar, 2);
    await watcher.start();
    calendar.apply(sampleEvent({ id: 'e1', created: NOW }));
    calendar.apply(sampleEvent({ id: 'e2', created: NOW }));
    await expect(watcher.poll()).rejects.toThrow('bus down');
    expect(published.map((event) => event.topic)).toEqual([
      GOOGLE_CALENDAR_TOPICS.eventCreated,
      GOOGLE_CALENDAR_TOPICS.eventCreated,
    ]);
    const retried = await watcher.poll();
    expect(retried.map((change) => change.event.id)).toEqual(['e1', 'e2']);
    const notice = interactionPromptSchema.parse(published.at(-1)?.payload);
    expect(notice.title).toBe('2 calendar changes');
    expect(await watcher.poll()).toEqual([]);
  });
});
