import { GOOGLE_CALENDAR_SOURCE, GOOGLE_CALENDAR_TOPICS } from '@sysdesign/contracts';
import {
  defineTool,
  type RunnableTool,
  type SessionEventsPort,
  type ToolSpec,
} from '@sysdesign/tool-session';
import { z } from 'zod';

import type { CalendarEvent, CalendarPort, EventTime } from '../calendar';
import type { CalendarSettings, SchedulingSettings } from '../settings';
import { calendarLines, eventLine, eventLines, eventText, slotLines, whenOf } from './render';
import { suggestSlots } from './scheduling';

/**
 * The calendar's tools, declared once: each a name, what it does, its
 * parameters, its effect and what it answers. Every write tells the people
 * on the event, so every write waits for the operator's yes; a delete cannot
 * be undone, so it is irreversible besides. The reads, and the slot finder,
 * ask nobody.
 */
const DEFAULT_WINDOW_DAYS = 30;

const instant = z.iso
  .datetime({ offset: true })
  .describe('An instant as ISO 8601 with its offset, e.g. 2026-10-20T15:00:00-07:00.');
const calendarId = z
  .string()
  .min(1)
  .nullable()
  .describe('A calendar id as list_calendars lists it; null for the primary calendar.');
const eventId = z.string().min(1).describe('An event id exactly as an earlier result listed it.');
const email = z.string().min(3);

const eventTimeOf = (value: string, timeZone: string): EventTime => ({
  dateTime: value,
  date: null,
  timeZone,
});

export interface CatalogDeps {
  calendar: CalendarPort;
  scheduling: SchedulingSettings;
  sizes: CalendarSettings;
  events: SessionEventsPort;
  clock: () => Date;
}

/** An event as the bus hears of it. */
const said = (event: CalendarEvent) => ({
  calendarId: event.calendarId,
  eventId: event.id,
  summary: event.summary,
  start: whenOf(event.start),
  end: whenOf(event.end),
});

export function calendarTools({
  calendar,
  scheduling,
  sizes,
  events,
  clock,
}: CatalogDeps): RunnableTool[] {
  const tool = <P extends z.ZodObject>(spec: ToolSpec<P>): RunnableTool =>
    defineTool(spec, GOOGLE_CALENDAR_SOURCE);
  const primary = (id: string | null): string => id ?? 'primary';
  const defaultWindow = () => {
    const now = clock();
    return {
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 86_400_000).toISOString(),
    };
  };

  return [
    tool({
      name: 'list_calendars',
      description: 'Lists the calendars the account can see, the primary one marked.',
      parameters: z.object({}),
      effect: 'read',
      approval: false,
      run: async () => {
        const calendars = await calendar.listCalendars();
        return { outcome: 'ok', summary: calendarLines(calendars), data: calendars };
      },
    }),
    tool({
      name: 'list_events',
      description:
        'Lists the events of a window, earliest first, each with its id, time, title, status and attendees.',
      parameters: z.object({
        calendarId,
        timeMin: instant,
        timeMax: instant,
        max: z
          .number()
          .int()
          .min(1)
          .max(sizes.listCeiling)
          .nullable()
          .describe(`At most this many; null for ${sizes.listMax}.`),
      }),
      effect: 'read',
      approval: false,
      run: async ({ calendarId: id, timeMin, timeMax, max }) => {
        const listed = await calendar.listEvents(
          primary(id),
          { timeMin, timeMax },
          null,
          max ?? sizes.listMax,
        );
        return { outcome: 'ok', summary: eventLines(listed), data: listed };
      },
    }),
    tool({
      name: 'search_events',
      description: `Finds events whose title, description, location or attendees match the words given, within a window — the next ${DEFAULT_WINDOW_DAYS} days unless given.`,
      parameters: z.object({
        query: z.string().min(1),
        calendarId,
        timeMin: instant.nullable(),
        timeMax: instant.nullable(),
      }),
      effect: 'read',
      approval: false,
      run: async ({ query, calendarId: id, timeMin, timeMax }) => {
        const window = defaultWindow();
        const found = await calendar.listEvents(
          primary(id),
          { timeMin: timeMin ?? window.timeMin, timeMax: timeMax ?? window.timeMax },
          query,
          sizes.listMax,
        );
        return { outcome: 'ok', summary: eventLines(found), data: found };
      },
    }),
    tool({
      name: 'get_event',
      description:
        'Reads one event whole: when, where, who organizes it, who is invited and how each answered.',
      parameters: z.object({ eventId, calendarId }),
      effect: 'read',
      approval: false,
      run: async ({ eventId: id, calendarId: cal }) => {
        const event = await calendar.getEvent(primary(cal), id);
        if (event === null) return { outcome: 'refused', summary: `no event ${id}`, data: null };
        return { outcome: 'ok', summary: eventText(event), data: event };
      },
    }),
    tool({
      name: 'suggest_time',
      description: `Finds free slots for a meeting with the attendees given: within the window, during working hours (${scheduling.workingHours.start}–${scheduling.workingHours.end} ${scheduling.timeZone}, working days only), on a ${scheduling.slotMinutes}-minute grid, when neither you nor they are busy. Deterministic: no model picks.`,
      parameters: z.object({
        attendees: z
          .array(email)
          .describe('Their addresses; free/busy is read where their calendars are shared.'),
        durationMinutes: z.number().int().min(5).max(480),
        windowStart: instant,
        windowEnd: instant,
        count: z
          .number()
          .int()
          .min(1)
          .max(sizes.suggestCeiling)
          .nullable()
          .describe(`How many slots to offer; null for ${sizes.suggestMax}.`),
      }),
      effect: 'read',
      approval: false,
      run: async ({ attendees, durationMinutes, windowStart, windowEnd, count }) => {
        const freeBusy = await calendar.freeBusy({ timeMin: windowStart, timeMax: windowEnd }, [
          'primary',
          ...attendees,
        ]);
        const busy = Object.values(freeBusy.calendars).flatMap((each) => each.busy);
        const unknown = attendees.filter(
          (attendee) => (freeBusy.calendars[attendee]?.errors.length ?? 1) > 0,
        );
        const slots = suggestSlots(
          {
            window: { start: windowStart, end: windowEnd },
            durationMinutes,
            busy,
            count: count ?? sizes.suggestMax,
          },
          scheduling,
        );
        return { outcome: 'ok', summary: slotLines(slots, unknown), data: { slots, unknown } };
      },
    }),
    tool({
      name: 'create_event',
      description:
        'Creates an event and invites its attendees, who are told. Waits for the operator’s approval.',
      parameters: z.object({
        calendarId,
        summary: z.string().min(1),
        description: z.string().nullable(),
        location: z.string().nullable(),
        start: instant,
        end: instant,
        attendees: z.array(email),
      }),
      effect: 'write',
      approval: true,
      run: async ({ calendarId: cal, summary, description, location, start, end, attendees }) => {
        const created = await calendar.insertEvent({
          calendarId: primary(cal),
          summary,
          description,
          location,
          start: eventTimeOf(start, scheduling.timeZone),
          end: eventTimeOf(end, scheduling.timeZone),
          attendees,
        });
        await events.publish(GOOGLE_CALENDAR_TOPICS.eventCreated, said(created));
        return { outcome: 'ok', summary: `Created: ${eventLine(created).slice(2)}`, data: created };
      },
    }),
    tool({
      name: 'update_event',
      description:
        'Changes an event — any of its title, description, location, times or attendees — and tells its attendees. Waits for the operator’s approval.',
      parameters: z.object({
        eventId,
        calendarId,
        summary: z.string().min(1).nullable(),
        description: z.string().nullable(),
        location: z.string().nullable(),
        start: instant.nullable(),
        end: instant.nullable(),
        attendees: z
          .array(email)
          .nullable()
          .describe('The whole list, or null to leave the attendees as they are.'),
      }),
      effect: 'write',
      approval: true,
      run: async ({
        eventId: id,
        calendarId: cal,
        summary,
        description,
        location,
        start,
        end,
        attendees,
      }) => {
        const updated = await calendar.patchEvent(primary(cal), id, {
          ...(summary === null ? {} : { summary }),
          ...(description === null ? {} : { description }),
          ...(location === null ? {} : { location }),
          ...(start === null ? {} : { start: eventTimeOf(start, scheduling.timeZone) }),
          ...(end === null ? {} : { end: eventTimeOf(end, scheduling.timeZone) }),
          ...(attendees === null ? {} : { attendees }),
        });
        await events.publish(GOOGLE_CALENDAR_TOPICS.eventUpdated, said(updated));
        return { outcome: 'ok', summary: `Updated: ${eventLine(updated).slice(2)}`, data: updated };
      },
    }),
    tool({
      name: 'delete_event',
      description:
        'Removes an event for good and tells its attendees. Irreversible; waits for the operator’s approval.',
      parameters: z.object({ eventId, calendarId }),
      effect: 'irreversible',
      approval: true,
      run: async ({ eventId: id, calendarId: cal }) => {
        const event = await calendar.getEvent(primary(cal), id);
        if (event === null || !(await calendar.deleteEvent(primary(cal), id))) {
          return { outcome: 'refused', summary: `no event ${id}`, data: null };
        }
        await events.publish(GOOGLE_CALENDAR_TOPICS.eventCancelled, said(event));
        return {
          outcome: 'ok',
          summary: `Deleted event ${id} ${JSON.stringify(event.summary)}`,
          data: event,
        };
      },
    }),
    tool({
      name: 'respond_to_event',
      description:
        'Answers an invitation as the account — accepted, declined or tentative — and tells the organizer. Waits for the operator’s approval.',
      parameters: z.object({
        eventId,
        calendarId,
        response: z.enum(['accepted', 'declined', 'tentative']),
        comment: z.string().nullable(),
      }),
      effect: 'write',
      approval: true,
      run: async ({ eventId: id, calendarId: cal, response, comment }) => {
        const event = await calendar.getEvent(primary(cal), id);
        if (event === null) return { outcome: 'refused', summary: `no event ${id}`, data: null };
        if (!event.attendees.some((attendee) => attendee.self)) {
          return {
            outcome: 'refused',
            summary: `event ${id} does not invite this account: nothing to answer`,
            data: null,
          };
        }
        const answered = await calendar.respond(primary(cal), id, response, comment);
        await events.publish(GOOGLE_CALENDAR_TOPICS.eventUpdated, said(answered));
        return {
          outcome: 'ok',
          summary: `Answered ${response}: ${eventLine(answered).slice(2)}`,
          data: answered,
        };
      },
    }),
  ];
}
