/**
 * Where a run stands after the iterations recorded so far — one rule, shared
 * by the loop that publishes its progress and by the store that reads a
 * running run back, so the two can never crown a different best.
 */
import type { IterationTrace, RunTrace } from '@sysdesign/contracts';

import type { RunProgress } from '../contracts';
import { deriveLessons } from '../evidence/lessons';

/** The strict-better gate: a revision takes the crown only by beating it. */
export const beats = <T>(entry: IterationTrace<T>, best: IterationTrace<T> | null): boolean =>
  best === null || entry.decision.scores.overall > best.decision.scores.overall;

/** The iteration the gate crowns among those recorded, taken in order; null before any. */
export const bestOf = <T>(iterations: readonly IterationTrace<T>[]): IterationTrace<T> | null =>
  iterations.reduce<IterationTrace<T> | null>(
    (best, entry) => (beats(entry, best) ? entry : best),
    null,
  );

/**
 * The run so far: its pipeline and contract, every iteration recorded, the
 * best among them, the last one's decision and the lessons they teach — and
 * no stop reason, since it has not stopped. Null before the first iteration
 * lands: a standing needs an iteration to stand on. The iterations are a
 * copy, so a holder may keep it while the run goes on.
 */
export function progressOf<T>(
  head: Pick<RunTrace<T>, 'pipeline' | 'contract'>,
  iterations: readonly IterationTrace<T>[],
): RunProgress<T> | null {
  const best = bestOf(iterations);
  if (best === null) return null;
  return {
    pipeline: head.pipeline,
    contract: head.contract,
    iterations: [...iterations],
    bestIteration: best.iteration,
    finalDecision: iterations[iterations.length - 1].decision.finalDecision,
    stopReason: null,
    lessons: deriveLessons(iterations),
  };
}
