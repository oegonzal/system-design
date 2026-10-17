/**
 * The calendar as the tools and the watcher reach it: what a calendar, an
 * event, an attendee and a busy interval are to them, and the one port an
 * adapter fills. Nothing here knows HTTP; the Calendar REST adapter is one
 * filling, the in-memory calendar the specs' is another.
 */
export interface CalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
  timeZone: string | null;
  accessRole: string;
}

/** When an event starts or ends: an instant, or a whole day, as the calendar writes it. */
export interface EventTime {
  dateTime: string | null;
  date: string | null;
  timeZone: string | null;
}

export const RESPONSES = ['needsAction', 'declined', 'tentative', 'accepted'] as const;
export type Response = (typeof RESPONSES)[number];

export interface Attendee {
  email: string;
  displayName: string | null;
  responseStatus: Response | null;
  /** Whether this attendee is the account itself. */
  self: boolean;
  organizer: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary: string;
  description: string | null;
  location: string | null;
  start: EventTime;
  end: EventTime;
  attendees: Attendee[];
  organizer: { email: string; displayName: string | null; self: boolean } | null;
  htmlLink: string | null;
  created: string | null;
  updated: string | null;
}

export interface EventWindow {
  timeMin: string;
  timeMax: string;
}

export interface EventDraft {
  calendarId: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: EventTime;
  end: EventTime;
  attendees: string[];
}

/** What an update changes; a field left out stays as it is. */
export interface EventPatch {
  summary?: string;
  description?: string;
  location?: string;
  start?: EventTime;
  end?: EventTime;
  attendees?: string[];
}

export interface BusyInterval {
  start: string;
  end: string;
}

/** What free/busy answered per calendar asked: its busy intervals, or why it could not say. */
export interface FreeBusy {
  calendars: Record<string, { busy: BusyInterval[]; errors: string[] }>;
}

/** One page of a sync: the events changed, and the token the next sync continues from once the pages are done. */
export interface SyncPage {
  events: CalendarEvent[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
}

/** A sync token the calendar will no longer honour: the watcher starts again from now. */
export class SyncTokenExpired extends Error {
  override readonly name = 'SyncTokenExpired';
  constructor() {
    super('the calendar no longer honours the sync token: a full sync is due');
  }
}

export const CALENDAR = Symbol('CALENDAR');

export interface CalendarPort {
  listCalendars(): Promise<CalendarEntry[]>;
  /** Single instances of recurring events, ordered by start, within the window; `query` matches words in the event. */
  listEvents(
    calendarId: string,
    window: EventWindow,
    query: string | null,
    max: number,
  ): Promise<CalendarEvent[]>;
  /** Null for an event the calendar does not have. */
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null>;
  /** Creates the event and tells its attendees. */
  insertEvent(draft: EventDraft): Promise<CalendarEvent>;
  /** Changes the event and tells its attendees. */
  patchEvent(calendarId: string, eventId: string, patch: EventPatch): Promise<CalendarEvent>;
  /** Removes the event and tells its attendees; false for one the calendar does not have. */
  deleteEvent(calendarId: string, eventId: string): Promise<boolean>;
  /** The account's own answer to an invitation, told to its organizer. */
  respond(
    calendarId: string,
    eventId: string,
    response: Exclude<Response, 'needsAction'>,
    comment: string | null,
  ): Promise<CalendarEvent>;
  freeBusy(window: EventWindow, calendarIds: readonly string[]): Promise<FreeBusy>;
  /**
   * What changed: the first sync from `timeMin` with no token walks every
   * page, later ones continue from the token. Throws `SyncTokenExpired`.
   */
  sync(
    calendarId: string,
    cursor: { syncToken: string | null; pageToken: string | null; timeMin: string | null },
  ): Promise<SyncPage>;
}
