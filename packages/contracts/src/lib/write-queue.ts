/**
 * Writes chained one after another and never awaited by the work that queues
 * them: order is kept, a slow store never stalls the caller, and a failed
 * write is reported, never thrown — the record in memory is the truth, and a
 * write only mirrors it. Whoever closes the store drains the queue first, so
 * nothing queued outlives the close.
 */
export interface WriteQueue {
  /** Queue one write after the ones before it; resolves once it has settled. A rejection is reported with `what`. */
  write(what: string, task: () => Promise<void>): Promise<void>;
  /** Resolves once every queued write has settled. */
  drain(): Promise<void>;
}

export function createWriteQueue(report: (what: string, error: unknown) => void): WriteQueue {
  let chain: Promise<void> = Promise.resolve();
  return {
    write(what, task) {
      chain = chain.then(task).catch((error: unknown) => report(what, error));
      return chain;
    },
    drain: () => chain,
  };
}
