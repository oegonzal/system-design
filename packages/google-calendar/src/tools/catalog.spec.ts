import { GOOGLE_CALENDAR_TOPICS } from '@sysdesign/contracts';
import { ToolCatalog } from '@sysdesign/tool-session';
import { FakeEvents } from '@sysdesign/tool-session/testing';

import { InMemoryCalendar, OWNER, sampleEvent } from '../calendar/testing';
import { calendarTools } from './catalog';

const scheduling = {
  timeZone: 'America/Los_Angeles',
  workingHours: { start: '09:00', end: '17:00' },
  workingDays: [1, 2, 3, 4, 5],
  slotMinutes: 30,
};
const sizes = {
  listMax: 20,
  listCeiling: 50,
  suggestMax: 3,
  suggestCeiling: 10,
  recovery: { windowMs: 0, pauseMs: 1 },
};

const catalogOf = (calendar = new InMemoryCalendar([sampleEvent({ id: 'e1' })])) => {
  const events = new FakeEvents();
  const catalog = new ToolCatalog(
    calendarTools({
      calendar,
      scheduling,
      sizes,
      events,
      clock: () => new Date('2026-10-16T12:00:00.000Z'),
    }),
  );
  return { catalog, events, calendar };
};

const WEEK = { timeMin: '2026-10-19T00:00:00Z', timeMax: '2026-10-26T00:00:00Z' };

describe('the calendar tools', () => {
  it('[GCL-5] declares the nine tools once — five reads asking nobody, three writes and one irreversible removal each waiting for the operator', () => {
    const { catalog } = catalogOf();
    expect(catalog.declarations().map((tool) => [tool.name, tool.effect, tool.approval])).toEqual([
      ['list_calendars', 'read', false],
      ['list_events', 'read', false],
      ['search_events', 'read', false],
      ['get_event', 'read', false],
      ['suggest_time', 'read', false],
      ['create_event', 'write', true],
      ['update_event', 'write', true],
      ['delete_event', 'irreversible', true],
      ['respond_to_event', 'write', true],
    ]);
    expect(catalog.declarations().every((tool) => tool.provider === 'google-calendar')).toBe(true);
    expect(catalog.declaration('suggest_time')?.parameters['required']).toEqual([
      'attendees',
      'durationMinutes',
      'windowStart',
      'windowEnd',
      'count',
    ]);
  });

  it('[GCL-5] lists, searches and reads events in words a plan reads, and reads a missing event as a refusal', async () => {
    const { catalog } = catalogOf();
    expect(await catalog.execute('list_calendars', {})).toMatchObject({
      outcome: 'ok',
      summary:
        '- calendar primary · "Owner" · primary · owner · America/Los_Angeles\n- calendar team@example.test · "Team" · reader',
    });
    expect(
      await catalog.execute('list_events', { calendarId: null, ...WEEK, max: null }),
    ).toMatchObject({
      outcome: 'ok',
      summary:
        '- event e1 · 2026-10-20T17:00:00.000Z → 2026-10-20T17:30:00.000Z · "Design review" · confirmed · no attendees',
    });
    const found = await catalog.execute('search_events', {
      query: 'design',
      calendarId: null,
      timeMin: null,
      timeMax: null,
    });
    expect(found.summary).toContain('event e1');
    expect(
      (
        await catalog.execute('search_events', {
          query: 'nothing',
          calendarId: null,
          timeMin: null,
          timeMax: null,
        })
      ).summary,
    ).toBe('No event in the window.');
    const read = await catalog.execute('get_event', { eventId: 'e1', calendarId: null });
    expect(read.summary).toContain(
      'event e1 · calendar primary · confirmed\nSummary: Design review',
    );
    expect(read.summary).toContain(`Organizer: ${OWNER} (you)`);
    expect(await catalog.execute('get_event', { eventId: 'nope', calendarId: null })).toMatchObject(
      {
        outcome: 'refused',
        summary: 'no event nope',
      },
    );
  });

  it('[GCL-5] suggests free slots deterministically from everyone’s free/busy, naming the attendees whose calendars are not shared', async () => {
    const { catalog, calendar } = catalogOf();
    const ask = {
      durationMinutes: 30,
      windowStart: '2026-10-20T00:00:00Z',
      windowEnd: '2026-10-21T00:00:00Z',
      count: 2,
    };
    expect(
      await catalog.execute('suggest_time', { attendees: ['ada@example.test'], ...ask }),
    ).toMatchObject({
      outcome: 'ok',
      summary: [
        '- slot 1: 2026-10-20T16:00:00.000Z → 2026-10-20T16:30:00.000Z',
        '- slot 2: 2026-10-20T16:30:00.000Z → 2026-10-20T17:00:00.000Z',
        'Free/busy unknown for ada@example.test: their calendars are not shared, so these slots are free on your side only.',
      ].join('\n'),
    });
    calendar.shared.add('ada@example.test');
    calendar.apply(
      sampleEvent({
        id: 'theirs',
        calendarId: 'ada@example.test',
        attendees: [
          {
            email: 'ada@example.test',
            displayName: null,
            responseStatus: 'accepted',
            self: false,
            organizer: true,
          },
        ],
        start: { dateTime: '2026-10-20T16:00:00.000Z', date: null, timeZone: null },
        end: { dateTime: '2026-10-20T16:30:00.000Z', date: null, timeZone: null },
      }),
    );
    expect(
      (await catalog.execute('suggest_time', { attendees: ['ada@example.test'], ...ask })).summary,
    ).toBe(
      [
        '- slot 1: 2026-10-20T16:30:00.000Z → 2026-10-20T17:00:00.000Z',
        '- slot 2: 2026-10-20T17:30:00.000Z → 2026-10-20T18:00:00.000Z',
      ].join('\n'),
    );
  });

  it('[GCL-5] creates, changes, answers and removes events — each said on the bus — and refuses an answer to an event that does not invite the account', async () => {
    const { catalog, events, calendar } = catalogOf();
    const created = await catalog.execute('create_event', {
      calendarId: null,
      summary: 'Sync',
      description: null,
      location: null,
      start: '2026-10-21T16:00:00Z',
      end: '2026-10-21T16:30:00Z',
      attendees: ['ada@example.test'],
    });
    expect(created.outcome).toBe('ok');
    expect(created.summary).toMatch(
      /^Created: event e\d+ · 2026-10-21T16:00:00Z → 2026-10-21T16:30:00Z · "Sync" · confirmed · ada@example\.test \(needsAction\)$/,
    );
    expect(calendar.events).toHaveLength(2);

    expect(
      await catalog.execute('update_event', {
        eventId: 'e1',
        calendarId: null,
        summary: 'Design review (moved)',
        description: null,
        location: null,
        start: null,
        end: null,
        attendees: null,
      }),
    ).toMatchObject({
      outcome: 'ok',
      summary:
        'Updated: event e1 · 2026-10-20T17:00:00.000Z → 2026-10-20T17:30:00.000Z · "Design review (moved)" · confirmed · no attendees',
    });

    expect(
      await catalog.execute('respond_to_event', {
        eventId: 'e1',
        calendarId: null,
        response: 'accepted',
        comment: null,
      }),
    ).toMatchObject({
      outcome: 'refused',
      summary: 'event e1 does not invite this account: nothing to answer',
    });
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
          {
            email: 'ada@example.test',
            displayName: null,
            responseStatus: 'accepted',
            self: false,
            organizer: true,
          },
        ],
      }),
    );
    expect(
      await catalog.execute('respond_to_event', {
        eventId: 'inv',
        calendarId: null,
        response: 'accepted',
        comment: 'Yes',
      }),
    ).toMatchObject({
      outcome: 'ok',
      summary: `Answered accepted: event inv · 2026-10-20T17:00:00.000Z → 2026-10-20T17:30:00.000Z · "Design review" · confirmed · ${OWNER} (accepted), ada@example.test (accepted)`,
    });
    expect(calendar.comments.get('inv')).toBe('Yes');

    expect(
      await catalog.execute('delete_event', { eventId: 'e1', calendarId: null }),
    ).toMatchObject({
      outcome: 'ok',
      summary: 'Deleted event e1 "Design review (moved)"',
    });
    expect(
      await catalog.execute('delete_event', { eventId: 'e1', calendarId: null }),
    ).toMatchObject({
      outcome: 'refused',
      summary: 'no event e1',
    });
    expect(events.published.map((event) => event.topic)).toEqual([
      GOOGLE_CALENDAR_TOPICS.eventCreated,
      GOOGLE_CALENDAR_TOPICS.eventUpdated,
      GOOGLE_CALENDAR_TOPICS.eventUpdated,
      GOOGLE_CALENDAR_TOPICS.eventCancelled,
    ]);
    expect(events.published[0]?.payload).toMatchObject({
      calendarId: 'primary',
      summary: 'Sync',
      start: '2026-10-21T16:00:00Z',
      end: '2026-10-21T16:30:00Z',
    });
  });
});
