import { z } from 'zod';

const positive = z.number().int().positive();

/**
 * What the interactions layer is configured with: how it consumes the bus,
 * how hard it tries a channel before passing over, and how long it keeps a
 * closed prompt. The values live in the package's `config/interactions/`
 * files alone; each field's meaning is said here.
 */
export const interactionSettingsSchema = z.strictObject({
  /** How long the dispatcher's pull waits for an event before it asks again; within the bus's own limit. */
  pullWaitMs: positive,
  /** The most events the dispatcher takes in one pull; within the bus's own limit. */
  eventsPerPull: positive,
  /** How many times a delivery or a close is tried before it is passed over, so one channel never holds back the events behind it. */
  deliveryAttempts: positive,
  /** The pause between those tries, and after a pull that failed. */
  retryPauseMs: positive,
  /** How long a closed prompt is kept, for a late reply to be told it closed, before the sweep purges it. */
  closedRetentionMs: positive,
  /** How often the sweep withdraws expired prompts and purges old closed ones; null never, as in a spec. */
  sweepEveryMs: positive.nullable(),
});
export type InteractionSettings = z.infer<typeof interactionSettingsSchema>;

export const INTERACTION_SETTINGS = Symbol('INTERACTION_SETTINGS');
