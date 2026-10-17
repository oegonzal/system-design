import type { CalendarEntry, CalendarEvent, EventTime } from '../calendar';
import type { Slot } from './scheduling';

/**
 * What a tool answers in words: the summary a plan reads. Every line names
 * the ids a later call takes, so a plan never has to guess one.
 */
export const whenOf = (time: EventTime): string =>
  time.dateTime ?? (time.date === null ? 'unset' : `${time.date} (all day)`);

const span = (event: CalendarEvent): string =>
  event.start.date !== null && event.start.date === event.end.date
    ? whenOf(event.start)
    : `${whenOf(event.start)} → ${whenOf(event.end)}`;

const attendeesOf = (event: CalendarEvent): string =>
  event.attendees.length === 0
    ? 'no attendees'
    : event.attendees
        .map(
          (attendee) =>
            `${attendee.email}${attendee.responseStatus === null ? '' : ` (${attendee.responseStatus})`}`,
        )
        .join(', ');

export const eventLine = (event: CalendarEvent): string =>
  `- event ${event.id} · ${span(event)} · ${JSON.stringify(event.summary)} · ${event.status} · ${attendeesOf(event)}`;

export const eventLines = (events: readonly CalendarEvent[]): string =>
  events.length === 0 ? 'No event in the window.' : events.map(eventLine).join('\n');

export const eventText = (event: CalendarEvent): string =>
  [
    `event ${event.id} · calendar ${event.calendarId} · ${event.status}`,
    `Summary: ${event.summary}`,
    `When: ${span(event)}`,
    ...(event.location === null ? [] : [`Where: ${event.location}`]),
    `Organizer: ${event.organizer === null ? 'unknown' : `${event.organizer.email}${event.organizer.self ? ' (you)' : ''}`}`,
    `Attendees: ${attendeesOf(event)}`,
    ...(event.description === null ? [] : ['', event.description]),
  ].join('\n');

export const calendarLines = (calendars: readonly CalendarEntry[]): string =>
  calendars
    .map(
      (calendar) =>
        `- calendar ${calendar.id} · ${JSON.stringify(calendar.summary)}${calendar.primary ? ' · primary' : ''} · ${calendar.accessRole}${calendar.timeZone === null ? '' : ` · ${calendar.timeZone}`}`,
    )
    .join('\n');

export const slotLines = (slots: readonly Slot[], unknown: readonly string[]): string =>
  [
    ...(slots.length === 0
      ? ['No free slot in the window.']
      : slots.map((slot, position) => `- slot ${position + 1}: ${slot.start} → ${slot.end}`)),
    ...(unknown.length === 0
      ? []
      : [
          `Free/busy unknown for ${unknown.join(', ')}: their calendars are not shared, so these slots are free on your side only.`,
        ]),
  ].join('\n');
