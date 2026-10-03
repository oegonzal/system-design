/**
 * The session's live writes, and its sign of life. Both after the quality
 * loop's own run service: writes are chained and never awaited by the engine,
 * so order is kept, a slow database never stalls the browser, and a failed
 * write is reported, not thrown; the heartbeat ticks on a timer of its own,
 * unref'd, so a long wait on the loop costs no beats and a finished process
 * is not kept alive by it.
 */

/** How often a running session beats, and how long a silence a reader takes for death. */
export const SESSION_HEARTBEAT_EVERY_MS = 15_000;
export const SESSION_STALE_AFTER_MS = 60_000;

export interface WriteQueue {
  /** Queue one write after the ones before it; a rejection is reported with `what`. */
  write(what: string, task: () => Promise<void>): void;
  /** Resolves once every queued write has settled. */
  drain(): Promise<void>;
  /** How many writes are still in flight. */
  readonly pending: number;
}

export function createWriteQueue(report: (what: string, error: unknown) => void): WriteQueue {
  let chain: Promise<void> = Promise.resolve();
  let pending = 0;
  return {
    write(what, task) {
      pending += 1;
      chain = chain
        .then(task)
        .catch((error: unknown) => report(what, error))
        .finally(() => {
          pending -= 1;
        });
    },
    drain: () => chain,
    get pending() {
      return pending;
    },
  };
}

/** An unref'd interval that beats; a failed beat is reported, never thrown. */
export function heartbeatTicker(
  beat: () => Promise<void>,
  everyMs: number,
  report: (error: unknown) => void,
): { stop(): void } {
  const timer = setInterval(() => void beat().catch(report), everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

/** Whether a session that says `running` is still alive, by its beat. */
export const isLive = (heartbeatAt: string, now: Date, staleAfterMs = SESSION_STALE_AFTER_MS) =>
  now.getTime() - Date.parse(heartbeatAt) <= staleAfterMs;
