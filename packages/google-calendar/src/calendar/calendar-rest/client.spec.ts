import { fakeGoogleFetch, FakeTokenSource, googleError, json } from '@sysdesign/google-kit/testing';

import { SyncTokenExpired } from '../ports';
import { CALENDAR_API, CalendarRest } from './client';

const EVENTS = `${CALENDAR_API}/calendars/primary/events`;

const wire = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'confirmed',
  summary: 'Design review',
  start: { dateTime: '2026-10-20T10:00:00-07:00', timeZone: 'America/Los_Angeles' },
  end: { dateTime: '2026-10-20T10:30:00-07:00', timeZone: 'America/Los_Angeles' },
  attendees: [
    { email: 'owner@x.test', self: true, responseStatus: 'needsAction' },
    { email: 'ada@x.test', responseStatus: 'accepted', organizer: true },
  ],
  organizer: { email: 'ada@x.test' },
  created: '2026-10-16T00:00:00.000Z',
  updated: '2026-10-16T00:00:00.000Z',
  ...extra,
});

const WINDOW = { timeMin: '2026-10-19T00:00:00.000Z', timeMax: '2026-10-26T00:00:00.000Z' };

describe('the Calendar REST adapter', () => {
  it('[GCL-3] lists calendars and a window’s events as single instances in start order, reads one whole, and answers null for one the calendar does not have', async () => {
    const google = fakeGoogleFetch({
      [`GET ${CALENDAR_API}/users/me/calendarList`]: () =>
        json({
          items: [
            {
              id: 'primary',
              summary: 'Owner',
              primary: true,
              timeZone: 'America/Los_Angeles',
              accessRole: 'owner',
            },
            { id: 'team@x.test', summary: 'Team' },
          ],
        }),
      [`GET ${EVENTS}`]: () => json({ items: [wire('e1')] }),
      [`GET ${EVENTS}/e1`]: () => json(wire('e1', { location: 'Room 1' })),
      [`GET ${EVENTS}/nope`]: () => googleError(404, 'notFound', 'Not Found'),
    });
    const calendar = new CalendarRest(new FakeTokenSource(), google.fetch);
    expect(await calendar.listCalendars()).toEqual([
      {
        id: 'primary',
        summary: 'Owner',
        primary: true,
        timeZone: 'America/Los_Angeles',
        accessRole: 'owner',
      },
      { id: 'team@x.test', summary: 'Team', primary: false, timeZone: null, accessRole: 'reader' },
    ]);
    const listed = await calendar.listEvents('primary', WINDOW, 'review', 5);
    expect(listed.map((event) => event.id)).toEqual(['e1']);
    const query = google.calls[1]?.url.searchParams;
    expect(query?.get('singleEvents')).toBe('true');
    expect(query?.get('orderBy')).toBe('startTime');
    expect(query?.get('q')).toBe('review');
    expect(query?.get('maxResults')).toBe('5');
    expect(query?.get('timeMin')).toBe(WINDOW.timeMin);
    expect(await calendar.getEvent('primary', 'e1')).toEqual({
      id: 'e1',
      calendarId: 'primary',
      status: 'confirmed',
      summary: 'Design review',
      description: null,
      location: 'Room 1',
      start: { dateTime: '2026-10-20T10:00:00-07:00', date: null, timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-10-20T10:30:00-07:00', date: null, timeZone: 'America/Los_Angeles' },
      attendees: [
        {
          email: 'owner@x.test',
          displayName: null,
          responseStatus: 'needsAction',
          self: true,
          organizer: false,
        },
        {
          email: 'ada@x.test',
          displayName: null,
          responseStatus: 'accepted',
          self: false,
          organizer: true,
        },
      ],
      organizer: { email: 'ada@x.test', displayName: null, self: false },
      htmlLink: null,
      created: '2026-10-16T00:00:00.000Z',
      updated: '2026-10-16T00:00:00.000Z',
    });
    expect(await calendar.getEvent('primary', 'nope')).toBeNull();
  });

  it('[GCL-3] creates, changes and removes events telling their attendees, answers an invitation on the account’s own entry alone, and reads free/busy', async () => {
    const google = fakeGoogleFetch({
      [`POST ${EVENTS}`]: () =>
        json(wire('e2', { summary: 'Sync', attendees: [{ email: 'ada@x.test' }] })),
      [`GET ${EVENTS}/e1`]: () => json(wire('e1')),
      [`PATCH ${EVENTS}/e1`]: (call) => json({ ...wire('e1'), ...(call.body as object) }),
      [`DELETE ${EVENTS}/e1`]: () => new Response(null, { status: 204 }),
      [`DELETE ${EVENTS}/gone`]: () => googleError(410, 'deleted', 'Resource has been deleted'),
      [`POST ${CALENDAR_API}/freeBusy`]: () =>
        json({
          calendars: {
            primary: { busy: [{ start: '2026-10-20T17:00:00Z', end: '2026-10-20T17:30:00Z' }] },
            'ada@x.test': { errors: [{ reason: 'notFound' }] },
          },
        }),
    });
    const calendar = new CalendarRest(new FakeTokenSource(), google.fetch);
    const start = {
      dateTime: '2026-10-21T09:00:00-07:00',
      date: null,
      timeZone: 'America/Los_Angeles',
    };
    const end = {
      dateTime: '2026-10-21T09:30:00-07:00',
      date: null,
      timeZone: 'America/Los_Angeles',
    };
    const created = await calendar.insertEvent({
      calendarId: 'primary',
      summary: 'Sync',
      description: null,
      location: 'Room 1',
      start,
      end,
      attendees: ['ada@x.test'],
    });
    expect(created.summary).toBe('Sync');
    const posted = google.calls[0];
    expect(posted?.url.searchParams.get('sendUpdates')).toBe('all');
    expect(posted?.body).toEqual({
      summary: 'Sync',
      location: 'Room 1',
      start: { dateTime: '2026-10-21T09:00:00-07:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-10-21T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
      attendees: [{ email: 'ada@x.test' }],
    });

    expect((await calendar.patchEvent('primary', 'e1', { summary: 'Moved' })).summary).toBe(
      'Moved',
    );
    const patched = google.calls[1];
    expect(patched?.method).toBe('PATCH');
    expect(patched?.url.searchParams.get('sendUpdates')).toBe('all');
    expect(patched?.body).toEqual({ summary: 'Moved' });

    const answered = await calendar.respond('primary', 'e1', 'accepted', 'See you there');
    expect(answered.attendees.map((attendee) => attendee.responseStatus)).toEqual([
      'accepted',
      'accepted',
    ]);
    expect(google.calls[3]?.body).toEqual({
      attendees: [
        { email: 'owner@x.test', self: true, responseStatus: 'accepted', comment: 'See you there' },
        { email: 'ada@x.test', responseStatus: 'accepted', organizer: true },
      ],
    });

    expect(await calendar.deleteEvent('primary', 'e1')).toBe(true);
    expect(google.calls[4]?.url.searchParams.get('sendUpdates')).toBe('all');
    expect(await calendar.deleteEvent('primary', 'gone')).toBe(false);

    expect(
      await calendar.freeBusy({ timeMin: WINDOW.timeMin, timeMax: WINDOW.timeMax }, [
        'primary',
        'ada@x.test',
      ]),
    ).toEqual({
      calendars: {
        primary: {
          busy: [{ start: '2026-10-20T17:00:00Z', end: '2026-10-20T17:30:00Z' }],
          errors: [],
        },
        'ada@x.test': { busy: [], errors: ['notFound'] },
      },
    });
    expect(google.calls.at(-1)?.body).toEqual({
      timeMin: WINDOW.timeMin,
      timeMax: WINDOW.timeMax,
      items: [{ id: 'primary' }, { id: 'ada@x.test' }],
    });
  });

  it('[GCL-3] syncs: a full sync from a time walks pages for the token, an incremental one continues from it, and a token the calendar refuses reads as expired', async () => {
    const google = fakeGoogleFetch({
      [`GET ${EVENTS}`]: (call) => {
        const query = call.url.searchParams;
        if (query.get('syncToken') === 'old') {
          return googleError(410, 'fullSyncRequired', 'Sync token is no longer valid');
        }
        if (query.get('syncToken') === 's1') {
          return json({ items: [wire('e1', { status: 'cancelled' })], nextSyncToken: 's2' });
        }
        if (query.get('pageToken') === 'p2') return json({ items: [], nextSyncToken: 's1' });
        return json({ items: [wire('e1')], nextPageToken: 'p2' });
      },
    });
    const calendar = new CalendarRest(new FakeTokenSource(), google.fetch);
    const since = '2026-10-16T12:00:00.000Z';
    const first = await calendar.sync('primary', {
      syncToken: null,
      pageToken: null,
      timeMin: since,
    });
    expect(first.events.map((event) => event.id)).toEqual(['e1']);
    expect(first.nextPageToken).toBe('p2');
    expect(first.nextSyncToken).toBeNull();
    const asked = google.calls[0]?.url.searchParams;
    expect(asked?.get('timeMin')).toBe(since);
    expect(asked?.get('singleEvents')).toBe('true');
    expect(asked?.has('syncToken')).toBe(false);

    const second = await calendar.sync('primary', {
      syncToken: null,
      pageToken: 'p2',
      timeMin: since,
    });
    expect(second).toEqual({ events: [], nextPageToken: null, nextSyncToken: 's1' });

    const third = await calendar.sync('primary', {
      syncToken: 's1',
      pageToken: null,
      timeMin: null,
    });
    expect(third.events.map((event) => event.status)).toEqual(['cancelled']);
    expect(third.nextSyncToken).toBe('s2');
    expect(google.calls[2]?.url.searchParams.has('timeMin')).toBe(false);

    await expect(
      calendar.sync('primary', { syncToken: 'old', pageToken: null, timeMin: null }),
    ).rejects.toThrow(SyncTokenExpired);
  });
});
