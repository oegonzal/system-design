/**
 * How long a caller rides out a service it calls that is restarting. Within
 * the window an attempt whose settled outcome the caller declares transient is
 * made again at the pause; past it, the outcome stands as it would have at
 * once. One loop for every HTTP client in the repository — the loop client
 * calls a dead socket and a read the loop failed transient, the bus client a
 * dead socket and a pull the bus did not answer in time — so the difference
 * between them is each one's predicate, never a second loop. The declared shape is the wire shape: a settings file
 * carries the two numbers, and the clock a spec keeps time by is an option on
 * the client, never a field beside them.
 */
import { z } from 'zod';

export const recoverySchema = z.strictObject({
  /** How long a call whose outcome is transient is asked again; 0 asks once. */
  windowMs: z.number().int().min(0),
  /** The pause between those asks. */
  pauseMs: z.number().int().positive(),
});
export type Recovery = z.infer<typeof recoverySchema>;

/** No window: one attempt, so the pause is never taken — a caller that serves people says the service is down rather than wait on it. */
export const NO_RECOVERY: Recovery = { windowMs: 0, pauseMs: 1 };

/** One attempt as it settled: what it returned, or what it threw. */
export type Settled<T> = { value: T } | { error: unknown };

/** The clock a recovery is kept by; a spec passes one that advances only when slept. */
export interface RecoveryClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: RecoveryClock = {
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const settle = async <T>(attempt: () => Promise<T>): Promise<Settled<T>> => {
  try {
    return { value: await attempt() };
  } catch (error) {
    return { error };
  }
};

/**
 * The attempt's outcome — returned or thrown as it settled — made again at the
 * pause within the window for as long as the caller calls it transient.
 */
export async function rideOut<T>(
  recovery: Recovery,
  attempt: () => Promise<T>,
  transient: (outcome: Settled<T>) => boolean,
  clock: RecoveryClock = realClock,
): Promise<T> {
  const deadline = clock.now() + recovery.windowMs;
  for (;;) {
    const outcome = await settle(attempt);
    if (!transient(outcome) || clock.now() + recovery.pauseMs >= deadline) {
      if ('error' in outcome) throw outcome.error;
      return outcome.value;
    }
    await clock.sleep(recovery.pauseMs);
  }
}
