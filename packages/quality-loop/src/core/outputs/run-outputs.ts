/**
 * The standard view of what a finished run produced. `RunTrace` already holds
 * everything; this names the projections a consumer reads once, so nothing
 * outside the engine re-derives "the best iteration" or "was it admitted".
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  EvidenceLedger,
  IterationTrace,
  Lesson,
  QualityControlDecision,
  RemediationNote,
  RunTrace,
} from '@sysdesign/contracts';

export interface RunOutputs<T = unknown> {
  trace: RunTrace<T>;
  /** The iteration the loop crowned; null when no iteration ran. */
  best: IterationTrace<T> | null;
  artifact: T | null;
  ledger: EvidenceLedger | null;
  findings: ConfirmedFinding[];
  criteria: CriterionEvidence[];
  decision: QualityControlDecision | null;
  remediations: RemediationNote[];
  lessons: Lesson[];
}

export function outputsOf<T>(trace: RunTrace<T>): RunOutputs<T> {
  const best =
    trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ?? null;
  return {
    trace,
    best,
    artifact: best?.artifact ?? null,
    ledger: best?.ledger ?? null,
    findings: best?.ledger.findings ?? [],
    criteria: best?.ledger.criteria ?? [],
    decision: best?.decision ?? null,
    remediations: best?.remediations ?? [],
    lessons: trace.lessons,
  };
}

/**
 * What a caller that would draw on a finished run's best iteration is told.
 * `admitted`: it may. `fell-short`: it was judged, and a gate or the bar said
 * no. The other two are not verdicts at all — `no-rubric`: no criteria were
 * derived or supplied, so no lens had anything to judge against; `no-artifact`:
 * no iteration ran, or the best one produced nothing. Kept apart so "nothing
 * was judged" never reads as "judged and found wanting".
 */
export const ADMISSIONS = ['admitted', 'fell-short', 'no-rubric', 'no-artifact'] as const;
export type Admission = (typeof ADMISSIONS)[number];

/**
 * Whether a finished run's best iteration may be drawn on, and when not,
 * which of the three ways it may not.
 *
 * An `accept` always may. A run with no rubric, or no artifact, was never
 * judged: its controller's zero is not a score, and it says so here rather
 * than as a shortfall. Short of those, the loop's judgement is honoured where
 * it is item-specific — a faulted item is excluded by the caller — but a run
 * is not withheld wholesale merely because the iteration budget ran out
 * before someone else's blocker closed. `policyAllowed` is the one gate
 * deliberately not required: it is false whenever any blocker is open, and a
 * blocker on the summary would otherwise veto every memory beneath it. The
 * three gates that make the artifact and its score mean anything are required.
 */
export function admission(outputs: RunOutputs, acceptAt: number): Admission {
  if (outputs.trace.finalDecision === 'accept') return 'admitted';
  if (outputs.trace.contract.criteria.length === 0) return 'no-rubric';
  if (outputs.ledger === null || !outputs.ledger.artifactPresent) return 'no-artifact';
  if (outputs.decision === null) return 'fell-short';
  const { gates, scores } = outputs.decision;
  if (!gates.artifactPresent || !gates.validatorsPassed || !gates.evidenceSufficient) {
    return 'fell-short';
  }
  return scores.overall >= acceptAt ? 'admitted' : 'fell-short';
}

/** Whether a finished run's best iteration may be drawn on at all — `admission`, as a yes or no. */
export const admits = (outputs: RunOutputs, acceptAt: number): boolean =>
  admission(outputs, acceptAt) === 'admitted';
