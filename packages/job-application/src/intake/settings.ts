import {
  recoverySchema,
  SUBSCRIPTION_NAME,
  SUBSCRIPTION_NAME_MAX_LENGTH,
} from '@sysdesign/contracts';
import { z } from 'zod';

const positive = z.number().int().positive();

/**
 * How the record is fed from the bus: the subscription's name, how it pulls,
 * and how it rides out a bus that is restarting. The values live in the
 * package's `config/intake/` files alone; each field's meaning is said here.
 */
export const intakeSettingsSchema = z.strictObject({
  /** The subscription's name on the bus: one cursor the service resumes from after a restart. */
  subscription: z.string().regex(SUBSCRIPTION_NAME).max(SUBSCRIPTION_NAME_MAX_LENGTH),
  /** How long one pull waits for an event before asking again; within the bus's own limit. */
  pullWaitMs: positive,
  /** The most events one pull takes; within the bus's own limit. */
  eventsPerPull: positive,
  /** The pause after a pull that failed. */
  retryPauseMs: positive,
  /** How long a call rides out a bus that is restarting. */
  busRecovery: recoverySchema,
});
export type IntakeSettings = z.infer<typeof intakeSettingsSchema>;

export const INTAKE_SETTINGS = Symbol('INTAKE_SETTINGS');
