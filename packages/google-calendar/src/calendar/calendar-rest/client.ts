import { NO_RECOVERY, type Recovery } from '@sysdesign/contracts';
import {
  googleRequest,
  GoogleRefused,
  type GoogleCall,
  type TokenSource,
} from '@sysdesign/google-kit';
import { z } from 'zod';

import {
  RESPONSES,
  SyncTokenExpired,
  type Attendee,
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
} from '../ports';
import {
  calendarListSchema,
  eventListSchema,
  eventSchema,
  freeBusySchema,
  type EventWire,
} from './schemas';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/** How many events one full sync page carries; the most the API allows. */
const SYNC_PAGE = 250;

const timeOf = (time: EventWire['start']): EventTime => ({
  dateTime: time?.dateTime ?? null,
  date: time?.date ?? null,
  timeZone: time?.timeZone ?? null,
});

const timeWire = (time: EventTime): Record<string, string> => ({
  ...(time.dateTime === null ? {} : { dateTime: time.dateTime }),
  ...(time.date === null ? {} : { date: time.date }),
  ...(time.timeZone === null ? {} : { timeZone: time.timeZone }),
});

const responseOf = (status: string | undefined): Response | null =>
  (RESPONSES as readonly string[]).includes(status ?? '') ? (status as Response) : null;

const statusOf = (status: string | undefined): CalendarEvent['status'] =>
  status === 'cancelled' ? 'cancelled' : status === 'tentative' ? 'tentative' : 'confirmed';

/** An event as the port carries it, from what the API wrote. */
export const eventOf = (wire: EventWire, calendarId: string): CalendarEvent => ({
  id: wire.id,
  calendarId,
  status: statusOf(wire.status),
  summary: wire.summary ?? '',
  description: wire.description ?? null,
  location: wire.location ?? null,
  start: timeOf(wire.start),
  end: timeOf(wire.end),
  attendees: (wire.attendees ?? []).flatMap((attendee): Attendee[] =>
    attendee.email === undefined
      ? []
      : [
          {
            email: attendee.email,
            displayName: attendee.displayName ?? null,
            responseStatus: responseOf(attendee.responseStatus),
            self: attendee.self ?? false,
            organizer: attendee.organizer ?? false,
          },
        ],
  ),
  organizer:
    wire.organizer?.email === undefined
      ? null
      : {
          email: wire.organizer.email,
          displayName: wire.organizer.displayName ?? null,
          self: wire.organizer.self ?? false,
        },
  htmlLink: wire.htmlLink ?? null,
  created: wire.created ?? null,
  updated: wire.updated ?? null,
});

const segment = encodeURIComponent;

/** The Calendar REST API as the calendar port: every call authorized, every answer read by its schema, attendees told of every write. */
export class CalendarRest implements CalendarPort {
  constructor(
    private readonly auth: TokenSource,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly recovery: Recovery = NO_RECOVERY,
  ) {}

  private call<T>(call: GoogleCall<T>): Promise<T> {
    return googleRequest(this.auth, call, this.fetchImpl, this.recovery);
  }

  private events(calendarId: string): string {
    return `${CALENDAR_API}/calendars/${segment(calendarId)}/events`;
  }

  async listCalendars(): Promise<CalendarEntry[]> {
    const listed = await this.call({
      method: 'GET',
      url: `${CALENDAR_API}/users/me/calendarList`,
      schema: calendarListSchema,
    });
    return (listed.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary ?? item.id,
      primary: item.primary ?? false,
      timeZone: item.timeZone ?? null,
      accessRole: item.accessRole ?? 'reader',
    }));
  }

  async listEvents(
    calendarId: string,
    window: EventWindow,
    query: string | null,
    max: number,
  ): Promise<CalendarEvent[]> {
    const listed = await this.call({
      method: 'GET',
      url: this.events(calendarId),
      query: {
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: window.timeMin,
        timeMax: window.timeMax,
        maxResults: max,
        q: query ?? undefined,
      },
      schema: eventListSchema,
    });
    return (listed.items ?? []).map((item) => eventOf(item, calendarId));
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null> {
    try {
      const wire = await this.call({
        method: 'GET',
        url: `${this.events(calendarId)}/${segment(eventId)}`,
        schema: eventSchema,
      });
      return eventOf(wire, calendarId);
    } catch (error) {
      if (error instanceof GoogleRefused && (error.status === 404 || error.status === 410))
        return null;
      throw error;
    }
  }

  async insertEvent(draft: EventDraft): Promise<CalendarEvent> {
    const wire = await this.call({
      method: 'POST',
      url: this.events(draft.calendarId),
      query: { sendUpdates: 'all' },
      body: {
        summary: draft.summary,
        ...(draft.description === null ? {} : { description: draft.description }),
        ...(draft.location === null ? {} : { location: draft.location }),
        start: timeWire(draft.start),
        end: timeWire(draft.end),
        attendees: draft.attendees.map((email) => ({ email })),
      },
      schema: eventSchema,
    });
    return eventOf(wire, draft.calendarId);
  }

  async patchEvent(calendarId: string, eventId: string, patch: EventPatch): Promise<CalendarEvent> {
    const wire = await this.call({
      method: 'PATCH',
      url: `${this.events(calendarId)}/${segment(eventId)}`,
      query: { sendUpdates: 'all' },
      body: {
        ...(patch.summary === undefined ? {} : { summary: patch.summary }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
        ...(patch.location === undefined ? {} : { location: patch.location }),
        ...(patch.start === undefined ? {} : { start: timeWire(patch.start) }),
        ...(patch.end === undefined ? {} : { end: timeWire(patch.end) }),
        ...(patch.attendees === undefined
          ? {}
          : { attendees: patch.attendees.map((email) => ({ email })) }),
      },
      schema: eventSchema,
    });
    return eventOf(wire, calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<boolean> {
    try {
      await this.call({
        method: 'DELETE',
        url: `${this.events(calendarId)}/${segment(eventId)}`,
        query: { sendUpdates: 'all' },
        schema: z.unknown(),
      });
      return true;
    } catch (error) {
      if (error instanceof GoogleRefused && (error.status === 404 || error.status === 410))
        return false;
      throw error;
    }
  }

  async respond(
    calendarId: string,
    eventId: string,
    response: Exclude<Response, 'needsAction'>,
    comment: string | null,
  ): Promise<CalendarEvent> {
    const wire = await this.call({
      method: 'GET',
      url: `${this.events(calendarId)}/${segment(eventId)}`,
      schema: eventSchema,
    });
    // The attendees list is replaced whole on a patch: every attendee goes
    // back as read, the account's own answer set on its own entry.
    const attendees = (wire.attendees ?? []).map((attendee) =>
      attendee.self === true
        ? { ...attendee, responseStatus: response, ...(comment === null ? {} : { comment }) }
        : attendee,
    );
    const patched = await this.call({
      method: 'PATCH',
      url: `${this.events(calendarId)}/${segment(eventId)}`,
      query: { sendUpdates: 'all' },
      body: { attendees },
      schema: eventSchema,
    });
    return eventOf(patched, calendarId);
  }

  async freeBusy(window: EventWindow, calendarIds: readonly string[]): Promise<FreeBusy> {
    const answered = await this.call({
      method: 'POST',
      url: `${CALENDAR_API}/freeBusy`,
      body: {
        timeMin: window.timeMin,
        timeMax: window.timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
      schema: freeBusySchema,
    });
    return {
      calendars: Object.fromEntries(
        Object.entries(answered.calendars).map(([id, calendar]) => [
          id,
          {
            busy: calendar.busy ?? [],
            errors: (calendar.errors ?? []).map((error) => error.reason ?? 'unknown'),
          },
        ]),
      ),
    };
  }

  async sync(
    calendarId: string,
    cursor: { syncToken: string | null; pageToken: string | null; timeMin: string | null },
  ): Promise<SyncPage> {
    try {
      const listed = await this.call({
        method: 'GET',
        url: this.events(calendarId),
        query: {
          singleEvents: true,
          maxResults: SYNC_PAGE,
          syncToken: cursor.syncToken ?? undefined,
          pageToken: cursor.pageToken ?? undefined,
          timeMin: cursor.syncToken === null ? (cursor.timeMin ?? undefined) : undefined,
        },
        schema: eventListSchema,
      });
      return {
        events: (listed.items ?? []).map((item) => eventOf(item, calendarId)),
        nextPageToken: listed.nextPageToken ?? null,
        nextSyncToken: listed.nextSyncToken ?? null,
      };
    } catch (error) {
      if (error instanceof GoogleRefused && error.status === 410) throw new SyncTokenExpired();
      throw error;
    }
  }
}
