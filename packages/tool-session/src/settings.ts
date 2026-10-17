import { recoverySchema } from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * How a program runs its tool sessions, as one file it ships under its own
 * `config/session/`: the rails, the recovery windows, how the operator is
 * waited for, and how much of what a session saw it keeps for the next
 * plan. Each field's meaning is said here; the value only in the file.
 */
const positive = z.number().int().positive();

/** The engine's own stop rules: each a limit that ends the session by its rail. */
export const railsSettingsSchema = z.strictObject({
  /** Plans the session may ask for before it stops; a caller may lower it for one session. */
  maxSteps: positive,
  /** Wall-clock minutes: a backstop against a session nobody is watching, not a budget to plan against. */
  maxMinutes: positive,
  /** Plans in a row that were refused or ran nothing before the session stops as stalled. */
  maxConsecutiveRefusals: positive,
  /** Calls in a row that failed or were refused before the session stops. */
  maxFailedCalls: positive,
  /** Loop calls in a row that answered nothing usable before the session stops. */
  maxBrainFaults: positive,
});
export type RailsSettings = z.infer<typeof railsSettingsSchema>;

export const toolSessionSettingsSchema = z.strictObject({
  rails: railsSettingsSchema,
  /** How long a session rides out a loop that is restarting before a call to it is a fault. */
  loopRecovery: recoverySchema,
  /** How long anything the session says on the bus rides out a service that is restarting. */
  busRecovery: recoverySchema,
  operator: z.strictObject({
    /** How long an approval or a question waits for the person before the session gives up on them. */
    expiresAfterMs: positive,
    /** How long one pull waits for the answer before asking again; within the bus's own limit. */
    pullWaitMs: positive,
    /** The most events one pull takes. */
    eventsPerPull: positive,
  }),
  /** How many of the latest observations a goal carries before the fit trims; older ones are counted, not shown. */
  observations: z.strictObject({ keep: positive }),
  /** How many of the latest calls the goal lists under Recent calls. */
  history: z.strictObject({ keep: positive }),
  /** How often a session asks after the run it is waiting on. */
  pollEveryMs: positive,
});
export type ToolSessionSettings = z.infer<typeof toolSessionSettingsSchema>;
