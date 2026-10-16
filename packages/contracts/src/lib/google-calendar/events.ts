/**
 * What the calendar service says happened: an event was created, changed or
 * cancelled — by the service's own tools or by anyone else, as the watcher
 * finds it — and an invitation waits for an answer.
 */
import { z } from 'zod';

export const GOOGLE_CALENDAR_TOPICS = {
  eventCreated: 'google-calendar.event.created',
  eventUpdated: 'google-calendar.event.updated',
  eventCancelled: 'google-calendar.event.cancelled',
  invitationReceived: 'google-calendar.invitation.received',
} as const;

const ID_MAX_LENGTH = 1_024;
const TEXT_MAX_LENGTH = 1_000;

/** When an event starts or ends: an instant, or a whole day as the calendar writes it. */
const when = z.string().min(1).max(64);

/** One event as the bus carries it: where it lives, which it is, and when. */
export const calendarEventSchema = z.strictObject({
  calendarId: z.string().min(1).max(ID_MAX_LENGTH),
  eventId: z.string().min(1).max(ID_MAX_LENGTH),
  summary: z.string().max(TEXT_MAX_LENGTH),
  start: when,
  end: when,
});

/** An event the account is invited to and has not answered. */
export const calendarInvitationSchema = calendarEventSchema.extend({
  organizer: z.string().max(TEXT_MAX_LENGTH),
});
