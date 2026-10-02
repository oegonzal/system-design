/**
 * How long one call may take, derived from what it declares.
 *
 * A call states the most it expects to write (`StructuredRequest.maxTokens`,
 * thinking included), and the model writes at a pace the recorded runs have
 * measured. So a call's limit is the time its whole declared answer takes at
 * the slowest pace the model has measurably kept, plus the fixed cost every
 * turn pays before it writes — spawning the CLI, reading the prompt, the first
 * token. One fixed cap for every call cannot be right for both ends: the 300 s
 * cap it replaces cut a coach writing a 28k-token canvas on its third revision
 * three times running, while a 1k-token probe sat under the same 300 s.
 *
 * The figures are sized from the recorded exchanges (`static/runs/*` /
 * `05-llm/*.meta.json`, 2026-09-20 → 2026-10-02, the era of today's
 * declarations), and the spec loads a representative set of them and fails if
 * any successful call would have outlived the limit its own declaration
 * derives:
 *
 *   - the slowest successful calls kept 26–31 tokens/s (a 3.4k-token rubric in
 *     146 s, a 2.7k-token evaluation in 116 s during the 2026-10-02 stall); a
 *     floor of 25 sits under all of them, where large answers ran at 55–110;
 *   - a turn that wrote almost nothing still took up to 7 s, so 30 s of
 *     overhead covers the spawn and a long prompt's first token with room;
 *   - against those, the tightest measured call (that rubric, declared 4,000)
 *     ran at 34.6 tokens/s of its declaration — inside the floor;
 *   - and no call runs under less than three minutes. A small declaration
 *     derives a limit nothing measured backs — the probe deriver's 1,000
 *     tokens come to 70 s, the brief classifier's 600 to 54 s — and neither
 *     records its exchanges, so no run shows what they take; the 300 s cap
 *     they ran under before never cut one. The minimum keeps them clear of a
 *     slow start until a measurement can size them.
 *
 * A declaration below what a stage writes is a contract the limit now
 * enforces, which is why every pipeline's spec pins its declared caps above
 * the outputs it has measurably written.
 */

export interface CallTimePolicy {
  /** What a turn costs before it writes: the spawn, the prompt read, the first token. */
  overheadMs: number;
  /** The slowest pace the model has measurably written at, thinking included. */
  floorTokensPerSecond: number;
  /** The least any call runs under, however little it declares. */
  minimumMs: number;
  /**
   * How long past its limit an aborted turn may take to end before the call
   * stops waiting for it. The SDK's kill path is SIGTERM two seconds after the
   * abort and SIGKILL five after that; a turn still streaming past this has
   * outlived its process and is abandoned rather than awaited.
   */
  graceMs: number;
}

export const CALL_TIME_POLICY: CallTimePolicy = {
  overheadMs: 30_000,
  floorTokensPerSecond: 25,
  minimumMs: 180_000,
  graceMs: 15_000,
};

export class CallTimePolicyError extends Error {
  override readonly name = 'CallTimePolicy';
}

/** Refuses a policy that could never admit a call, where it is declared. */
export function assertCallTimePolicy(policy: CallTimePolicy): CallTimePolicy {
  const { overheadMs, floorTokensPerSecond, minimumMs, graceMs } = policy;
  if (!(overheadMs >= 0 && minimumMs >= 0 && graceMs >= 0 && floorTokensPerSecond > 0)) {
    throw new CallTimePolicyError(
      `overheadMs, minimumMs and graceMs must be ≥ 0 and floorTokensPerSecond > 0, got ${JSON.stringify(policy)}`,
    );
  }
  return policy;
}

/** What a declaration derives on its own: its whole answer at the floor, plus the overhead. */
const derivedLimitMs = (maxTokens: number, policy: CallTimePolicy): number =>
  policy.overheadMs + Math.ceil((maxTokens / policy.floorTokensPerSecond) * 1000);

/** The limit a call declaring `maxTokens` runs under: what its declaration derives, and never under the minimum. */
export const callTimeLimitMs = (
  maxTokens: number,
  policy: CallTimePolicy = CALL_TIME_POLICY,
): number => Math.max(policy.minimumMs, derivedLimitMs(maxTokens, policy));

const seconds = (ms: number): number => Math.round(ms / 1000);

/** The limit, said the way a record reads it — and that it is the minimum, when the declaration derived less. */
export function describeCallLimit(
  maxTokens: number,
  policy: CallTimePolicy = CALL_TIME_POLICY,
): string {
  const derived = derivedLimitMs(maxTokens, policy);
  const basis = `${maxTokens} declared tokens at ${policy.floorTokensPerSecond}/s + ${seconds(policy.overheadMs)} s`;
  return derived >= policy.minimumMs
    ? `${seconds(derived)} s (${basis})`
    : `${seconds(policy.minimumMs)} s (the minimum; ${basis} is ${seconds(derived)} s)`;
}

/** A call's watch over its own limit. */
export interface Deadline {
  /** Resolves once the limit and the grace after it have both passed. */
  readonly abandoned: Promise<void>;
  /** True from the moment the limit passed and `onLimit` was called. */
  readonly expired: boolean;
  stop(): void;
}

export interface DeadlineOptions {
  limitMs: number;
  graceMs: number;
  /** Called once, when the limit passes. */
  onLimit: () => void;
  /** The wall clock the limit is measured on. */
  now?: () => number;
  /** How often the clock is read. */
  tickMs?: number;
}

/** Often enough that a limit fires within a second of passing. */
export const DEADLINE_TICK_MS = 1_000;

/**
 * Watch a limit on the wall clock, by reading it on a short tick rather than
 * arming one long timer. A timer is measured on the event loop's monotonic
 * clock, which is not the clock a call's duration is recorded on, and on a
 * machine that sleeps the two part; a tick reads the wall clock, so the first
 * tick after a wake sees the limit passed and acts on it. The watch never
 * waits on the turn itself: `abandoned` resolves on time whether or not the
 * stream the abort should have ended has ended.
 */
export function watchDeadline(options: DeadlineOptions): Deadline {
  const now = options.now ?? Date.now;
  const started = now();
  let expired = false;
  let stopped = false;
  let release: () => void = () => undefined;
  const abandoned = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setInterval(() => check(), options.tickMs ?? DEADLINE_TICK_MS);
  timer.unref?.();
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
  const check = (): void => {
    const elapsed = now() - started;
    if (!expired && elapsed >= options.limitMs) {
      expired = true;
      options.onLimit();
    }
    if (elapsed >= options.limitMs + options.graceMs) {
      stop();
      release();
    }
  };
  return {
    abandoned,
    get expired() {
      return expired;
    },
    stop,
  };
}
