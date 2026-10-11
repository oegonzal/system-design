import type { Waiter, WaitOutcome, Wakeup } from './ports';

/**
 * Wakes the pulls waiting in this process: one replica serves its own
 * waiters. A waiter is armed before the read it follows, so an event appended
 * between that read and the wait still wakes it, and closing releases every
 * waiter — the ones waiting now and any armed after — so shutdown never waits
 * out a long poll. A second replica would need the database to carry the
 * wakeup (LISTEN/NOTIFY) instead; this is the one place that would change.
 */
export class InProcessWakeup implements Wakeup {
  private readonly armed = new Set<(outcome: WaitOutcome) => void>();
  private closed = false;

  arm(): Waiter {
    let settled: WaitOutcome | null = this.closed ? 'closed' : null;
    let resolve: ((outcome: WaitOutcome) => void) | null = null;
    const fire = (outcome: WaitOutcome): void => {
      settled ??= outcome;
      resolve?.(settled);
    };
    if (settled === null) this.armed.add(fire);
    const cancel = (): void => {
      this.armed.delete(fire);
    };
    return {
      wait: (ms, signal) =>
        new Promise<WaitOutcome>((done) => {
          if (settled !== null || signal?.aborted) {
            cancel();
            done(settled ?? 'closed');
            return;
          }
          const timer = setTimeout(() => finish('timeout'), ms);
          const onAbort = (): void => finish('closed');
          signal?.addEventListener('abort', onAbort, { once: true });
          const finish = (outcome: WaitOutcome): void => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            cancel();
            done(outcome);
          };
          resolve = finish;
        }),
      cancel,
    };
  }

  notify(): void {
    for (const fire of [...this.armed]) fire('woken');
  }

  close(): void {
    this.closed = true;
    for (const fire of [...this.armed]) fire('closed');
  }
}
