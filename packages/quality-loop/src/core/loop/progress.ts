/**
 * Where a run stands after the iterations recorded so far — one rule, shared
 * by the loop that publishes its progress and by the store that reads a
 * running run back, so the two can never crown a different best.
 */
import type { IterationTrace, RunTrace } from '@sysdesign/contracts';

import type { RunProgress } from '../contracts';
import { deriveLessons } from '../evidence/lessons';

const hasArtifact = <T>(entry: IterationTrace<T>): boolean => entry.artifact !== null;

/**
 * The strict-better gate: a revision takes the crown only by beating it. An
 * iteration whose produce answered nothing has no artifact to stand on, so
 * it never takes the crown from one that has — and any artifact takes it
 * from an iteration that had none.
 */
export const beats = <T>(entry: IterationTrace<T>, best: IterationTrace<T> | null): boolean =>
  best === null ||
  (hasArtifact(entry) &&
    (!hasArtifact(best) || entry.decision.scores.overall > best.decision.scores.overall));

/** The iteration the gate crowns among those recorded, taken in order; null before any. */
const bestOf = <T>(iterations: readonly IterationTrace<T>[]): IterationTrace<T> | null =>
  iterations.reduce<IterationTrace<T> | null>(
    (best, entry) => (beats(entry, best) ? entry : best),
    null,
  );

/**
 * The run so far: its pipeline and contract, every iteration recorded, the
 * best among them, the last decision on an artifact and the lessons they
 * teach — and no stop reason, since it has not stopped. The decision is the
 * last iteration's that had an artifact: one whose produce answered nothing
 * was decided only for want of one, which says nothing of what the artifact
 * deserves next — so it is the last iteration's only when none had one. Null
 * before the first iteration lands: a standing needs an iteration to stand
 * on. The iterations are a copy, so a holder may keep it while the run goes
 * on.
 */
export function progressOf<T>(
  head: Pick<RunTrace<T>, 'pipeline' | 'contract'>,
  iterations: readonly IterationTrace<T>[],
): RunProgress<T> | null {
  const best = bestOf(iterations);
  if (best === null) return null;
  const decided = iterations.filter(hasArtifact).at(-1) ?? iterations[iterations.length - 1];
  return {
    pipeline: head.pipeline,
    contract: head.contract,
    iterations: [...iterations],
    bestIteration: best.iteration,
    finalDecision: decided.decision.finalDecision,
    stopReason: null,
    lessons: deriveLessons(iterations),
  };
}
