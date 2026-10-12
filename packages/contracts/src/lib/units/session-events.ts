/**
 * What a session says happened, for whoever keeps a record beyond it: it
 * started, a unit opened, a unit closed, it ended. The session publishes them
 * on the notifications bus and any subscriber reads them; each event stands on
 * its own under at-least-once delivery, so a `closed` that arrives without its
 * `opened` still says which unit, whose, and how it ended.
 */
import { z } from 'zod';

import { bounded, keptAtMost } from '../bounds';
import { TASK_LABEL_BOUND, URL_MAX_LENGTH } from '../browser-session/observation.schema';
import { TASK_OUTCOMES } from '../browser-session/vocab';
import { DOCUMENT_SUBJECT_MAX_LENGTH } from '../quality-loop/document-digest';
import { unitFacetsSchema } from './identity';

export const SESSION_TOPICS = {
  started: 'session.started',
  unitOpened: 'session.unit.opened',
  unitClosed: 'session.unit.closed',
  ended: 'session.ended',
} as const;

/** A browser profile's name, as a session is started with it. */
const PROFILE_MAX_LENGTH = 80;

const session = {
  sessionId: z.uuid(),
  /** Whose record the session's units belong to. */
  subject: bounded.id(DOCUMENT_SUBJECT_MAX_LENGTH, { min: 1 }),
  /** The profile it ran on: one profile runs one browser, so a later session on it means this one is over. */
  profile: bounded.id(PROFILE_MAX_LENGTH, { min: 1 }),
};

export const sessionStartedSchema = z.strictObject(session);
export type SessionStarted = z.infer<typeof sessionStartedSchema>;

/**
 * A unit as the session minted it — the task row's own id, so a record keyed
 * on it is the record `browser_task` carries. The label was read leniently
 * off a plan, so it is sized by what a lenient read returns, never by the
 * ceiling a plan is asked for.
 */
const unitSchema = z.strictObject({
  id: z.uuid(),
  ordinal: z.number().int().positive(),
  label: bounded.id(keptAtMost(TASK_LABEL_BOUND), { min: 1 }),
  url: bounded.id(URL_MAX_LENGTH).nullable(),
  facets: unitFacetsSchema,
});

const sessionUnit = {
  ...session,
  /** The session's declared lifetime: a unit still open past it was abandoned with its session. */
  maxMinutes: z.number().int().positive(),
  unit: unitSchema,
};

export const sessionUnitOpenedSchema = z.strictObject(sessionUnit);
export type SessionUnitOpened = z.infer<typeof sessionUnitOpenedSchema>;

export const sessionUnitClosedSchema = z.strictObject({
  ...sessionUnit,
  outcome: z.enum(TASK_OUTCOMES),
});
export type SessionUnitClosed = z.infer<typeof sessionUnitClosedSchema>;

export const sessionEndedSchema = z.strictObject({ sessionId: z.uuid() });
export type SessionEnded = z.infer<typeof sessionEndedSchema>;

/** One event as the session publishes it: a topic, and the payload that topic's schema declares. */
export type SessionEvent =
  | { topic: typeof SESSION_TOPICS.started; payload: SessionStarted }
  | { topic: typeof SESSION_TOPICS.unitOpened; payload: SessionUnitOpened }
  | { topic: typeof SESSION_TOPICS.unitClosed; payload: SessionUnitClosed }
  | { topic: typeof SESSION_TOPICS.ended; payload: SessionEnded };
