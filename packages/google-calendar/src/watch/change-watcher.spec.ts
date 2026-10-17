import {
  GOOGLE_CALENDAR_TOPICS,
  INTERACTION_TOPICS,
  interactionPromptSchema,
} from '@sysdesign/contracts';

import { InMemoryCalendar, OWNER, sampleEvent } from '../calendar/testing';
import { ChangeWatcher } from './change-watcher';

const settings = {
  enabled: true,
  pollEveryMs: 120_000,
  noticeTtlMs: 3_600_000,
  calendarId: 'primary',
};
const quiet = { info: () => undefined, warn: () => undefined };

const watching = (calendar: InMemoryCalendar) => {
  const published: { topic: string; source: string; payload: unknown }[] = [];
  const bus = {
    publish: (request: { topic: string; source: string; payload: unknown }) => {
      published.push(request);
      return Promise.resolve({ seq: '1', ...request, publishedAt: '' });
    },
  };
  const watcher = new ChangeWatcher(
    calendar,
    bus,
    settings,
    quiet,
    () => new Date('2026-10-16T12:00:00.000Z'),
  );
  return { watcher, published };
};

describe('the change watcher', () => {
  it('[GCL-6] tells nothing of what was there at the start, says each change since on the bus by its kind, and tells a person of a poll’s changes in one notice', async () => {
    const calendar = new InMemoryCalendar([sampleEvent({ id: 'old' })]);
    const { watcher, published } = watching(calendar);
    await watcher.start();
    expect(await watcher.poll()).toEqual([]);
    expect(published).toEqual([]);

    calendar.apply(
      sampleEvent({
        id: 'new',
        created: '2026-10-16T12:00:00.000Z',
        updated: '2026-10-16T12:00:00.000Z',
      }),
    );
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
        created: '2026-10-16T12:00:00.000Z',
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
    calendar.apply(sampleEvent({ id: 'missed', created: '2026-10-16T12:00:00.000Z' }));
    expect(await watcher.poll()).toEqual([]);
    expect(published).toEqual([]);
    calendar.apply(sampleEvent({ id: 'seen', created: '2026-10-16T12:00:00.000Z' }));
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
});
