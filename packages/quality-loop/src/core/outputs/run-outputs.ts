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
 * Whether a finished run's best iteration may be drawn on at all.
 *
 * An `accept` always may. Short of that, the loop's judgement is honoured
 * where it is item-specific — a faulted item is excluded by the caller — but a
 * run is not withheld wholesale merely because the iteration budget ran out
 * before someone else's blocker closed. `policyAllowed` is the one gate
 * deliberately not required: it is false whenever any blocker is open, and a
 * blocker on the summary would otherwise veto every memory beneath it. The
 * three gates that make the artifact and its score mean anything are required.
 */
export function admits(outputs: RunOutputs, acceptAt: number): boolean {
  if (outputs.trace.finalDecision === 'accept') return true;
  if (outputs.decision === null) return false;
  const { gates, scores } = outputs.decision;
  if (!gates.artifactPresent || !gates.validatorsPassed || !gates.evidenceSufficient) return false;
  return scores.overall >= acceptAt;
}
