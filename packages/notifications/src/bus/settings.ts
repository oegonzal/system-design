import { z } from 'zod';

const positive = z.number().int().positive();

/**
 * What the bus is configured with: how long it keeps what it no longer has
 * to, and how long and how much one pull may take. The values live in the
 * package's `config/bus/` files alone; each field's meaning is said here.
 */
export const busSettingsSchema = z.strictObject({
  /** How long an event is kept once every subscription has passed it. */
  retentionMs: positive,
  /** How long a subscription may go unpulled before it is removed, and the events it held back with the next sweep. */
  idleSubscriptionMs: positive,
  /** The longest one pull may wait for an event: well under the HTTP server's own request timeout. */
  maxWaitMs: positive,
  /** The most events one pull hands out. */
  maxEventsPerPull: positive,
  /** How often the sweep runs; null never, as in a spec. */
  sweepEveryMs: positive.nullable(),
});
export type BusSettings = z.infer<typeof busSettingsSchema>;

export const BUS_SETTINGS = Symbol('BUS_SETTINGS');
