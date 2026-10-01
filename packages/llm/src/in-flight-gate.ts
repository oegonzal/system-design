/**
 * How many provider calls this process may have in flight at once.
 *
 * Each call to the subscription client is an independent `claude` subprocess,
 * and nothing else counts them: a pipeline's declared concurrency bounds one
 * wave of one run, and runs are started without awaiting, so the true ceiling
 * has been the machine's. The gate is the one admission point, and it lives
 * here because how hard this process may lean on the provider is a property of
 * the provider relationship, not of whatever is asking.
 *
 * Two properties are load-bearing and both are asserted:
 *
 *   - **It never rejects of its own accord.** Callers sit inside a contract
 *     that answers `null` on failure, and the engine's worker pool has no
 *     cancellation — a throw from here would abandon siblings mid-call and
 *     leave their subprocesses holding permits. Work's own rejection passes
 *     through untouched; the permit is still released.
 *   - **Waiting is not working.** A caller is told how long it queued so the
 *     wait can be kept out of the call's own duration and out of whatever
 *     timeout the caller runs. A queue that counted against a call timeout
 *     would turn a busy process into lost samples, which is the one outcome
 *     this package exists to avoid.
 *
 * Admission is first-come-first-served, so a call queued behind a long wave is
 * not starved by later arrivals. There is no deadline on waiting: a slow answer
 * is worth more than no answer.
 */

/** What a caller is told about its wait, so the wait is never charged to the call. */
export interface Admitted {
  /** Milliseconds spent waiting for a permit; 0 when one was free. */
  queuedMs: number;
}

export interface InFlightGatePolicy {
  /** Calls allowed in flight at once. At least 1 — a gate that can reach 0 never admits. */
  ceiling: number;
}

/** Above any single pipeline's declared concurrency, so one run is never throttled by it. */
export const DEFAULT_GATE_POLICY: InFlightGatePolicy = { ceiling: 8 };

export interface InFlightGateOptions {
  policy?: InFlightGatePolicy;
  /** Injected so a spec measures a wait without one. */
  now?: () => number;
}

export class GatePolicyError extends Error {
  override readonly name = 'GatePolicy';
}

export class InFlightGate {
  private readonly ceiling: number;
  private readonly now: () => number;
  private inFlight = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(options: InFlightGateOptions = {}) {
    const { ceiling } = options.policy ?? DEFAULT_GATE_POLICY;
    if (!Number.isInteger(ceiling) || ceiling < 1) {
      throw new GatePolicyError(`ceiling must be an integer of at least 1, got ${String(ceiling)}`);
    }
    this.ceiling = ceiling;
    this.now = options.now ?? Date.now;
  }

  /** What the gate is doing right now — for a record, and for a spec. */
  snapshot(): { ceiling: number; inFlight: number; waiting: number } {
    return { ceiling: this.ceiling, inFlight: this.inFlight, waiting: this.waiting.length };
  }

  /**
   * Run `work` under a permit. The permit is held for exactly the span of
   * `work`, released whether it settles or throws, and the next waiter is
   * admitted in arrival order.
   */
  async run<T>(work: (admitted: Admitted) => Promise<T>): Promise<T> {
    const asked = this.now();
    if (this.inFlight >= this.ceiling) {
      await new Promise<void>((admit) => this.waiting.push(admit));
    }
    this.inFlight += 1;
    try {
      return await work({ queuedMs: this.now() - asked });
    } finally {
      this.inFlight -= 1;
      this.waiting.shift()?.();
    }
  }
}

/**
 * The process's gate. One ceiling per process, fixed at first use: a second
 * ceiling would mean two answers to "how hard may we lean on the provider".
 * Only the environment-driven factory reaches for it; a spec builds its own
 * and injects it, so nothing here needs a reset.
 */
let shared: InFlightGate | null = null;

export const providerGate = (policy?: InFlightGatePolicy): InFlightGate =>
  (shared ??= new InFlightGate({ policy }));
