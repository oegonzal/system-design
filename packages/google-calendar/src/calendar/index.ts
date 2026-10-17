// The calendar: the port the tools and the watcher reach it by, and its Calendar REST filling.
export { CALENDAR_API, CalendarRest, eventOf } from './calendar-rest/client';
export {
  CALENDAR,
  RESPONSES,
  SyncTokenExpired,
  type Attendee,
  type BusyInterval,
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
