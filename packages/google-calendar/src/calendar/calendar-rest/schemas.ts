/**
 * What the Calendar API answers, read for the fields the adapter uses and
 * no more: loose objects, since Google answers more than any reader needs.
 */
import { z } from 'zod';

const time = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
});

const person = z.object({
  email: z.string().optional(),
  displayName: z.string().optional(),
  self: z.boolean().optional(),
});

export const attendeeSchema = person.extend({
  responseStatus: z.string().optional(),
  organizer: z.boolean().optional(),
  comment: z.string().optional(),
});

export const eventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: time.optional(),
  end: time.optional(),
  attendees: z.array(attendeeSchema).optional(),
  organizer: person.optional(),
  htmlLink: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});
export type EventWire = z.infer<typeof eventSchema>;

export const eventListSchema = z.object({
  items: z.array(eventSchema).optional(),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});

export const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        primary: z.boolean().optional(),
        timeZone: z.string().optional(),
        accessRole: z.string().optional(),
      }),
    )
    .optional(),
});

export const freeBusySchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
      errors: z.array(z.object({ reason: z.string().optional() })).optional(),
    }),
  ),
});
