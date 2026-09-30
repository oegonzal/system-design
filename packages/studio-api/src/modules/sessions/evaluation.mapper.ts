import {
  submissionLocations,
  type ConfirmedFinding,
  type CriterionResultDto,
  type CriticReport,
  type DesignSubmission,
  type EvaluationDto,
  type EvaluationFindingDto,
  type EvaluationLocationDto,
  type EvaluationReport,
  type IterationTrace,
  type LensOutcome,
  type QualityRunDto,
  type SubmissionLocation,
} from '@sysdesign/contracts';

/**
 * A quality-loop run, read for one iteration, as the studio shows it. Pure:
 * the run and the graded submission in, the DTO out. The studio adds exactly
 * one thing to what the loop said — the join from the canvas pipeline's
 * positional ids back onto the stored revision, through the contract's own
 * `submissionLocations` (the same numbering the pipeline printed) — and
 * invents nothing: a score, a decision or a dimension the loop did not
 * produce is null here, and so is a score the loop earned nothing for.
 */
export function toEvaluationDto(
  run: QualityRunDto,
  iteration: number,
  submission: DesignSubmission,
): EvaluationDto {
  const header = {
    runId: run.runId,
    iteration,
    llm: run.llm,
    error: run.error?.message ?? null,
  };
  const empty = {
    overall: null,
    decision: null,
    decisionReason: null,
    dimensions: {},
    findings: [],
    criterionResults: [],
    stopReason: null,
  };
  if (run.trace === null) return { ...header, ...empty, status: run.status };

  const it = run.trace.iterations[iteration - 1];
  if (it === undefined) {
    return {
      ...header,
      ...empty,
      status: 'failed',
      error: `the run has no iteration ${iteration}`,
    };
  }
  const index = new Map(submissionLocations(submission).map((location) => [location.id, location]));
  const dimensions = { ...it.decision.scores.dimensions };
  return {
    ...header,
    status: run.status,
    // A zero over a ledger with nothing assessed is not a score.
    overall: nothingAssessed(dimensions) ? null : it.decision.scores.overall,
    decision: it.decision.finalDecision,
    decisionReason: it.decision.reason,
    dimensions,
    findings: it.ledger.findings.map((finding) => toFinding(finding, it, index)),
    criterionResults: it.ledger.criteria.map((row) => ({
      criterionId: row.criterionId,
      result: row.result,
      confidence: row.confidence,
      rationale: firstRationale(it.evaluators, row.criterionId),
    })),
    stopReason: run.trace.stopReason,
  };
}

const nothingAssessed = (dimensions: Record<string, number | null>): boolean =>
  Object.values(dimensions).every((value) => value === null);

const toFinding = (
  finding: ConfirmedFinding,
  it: IterationTrace,
  index: ReadonlyMap<string, SubmissionLocation>,
): EvaluationFindingDto => {
  // A ref the stored revision cannot place is kept verbatim in `locationRefs` and nowhere else.
  const locations: EvaluationLocationDto[] = finding.locationRefs.flatMap((ref) => {
    const location = index.get(ref);
    return location ? [{ ref, label: location.label, part: location.part, key: location.key }] : [];
  });
  const keysOf = (part: EvaluationLocationDto['part']) =>
    locations.flatMap((location) =>
      location.part === part && location.key !== null ? [location.key] : [],
    );
  return {
    id: finding.key,
    lenses: [...finding.lenses],
    type: finding.type,
    severity: finding.severity,
    confidence: finding.confidence,
    fixability: finding.fixability,
    criterionIds: [...finding.criterionIds],
    locations,
    nodeIds: keysOf('node'),
    edgeIds: keysOf('edge'),
    locationRefs: [...finding.locationRefs],
    rationale: finding.rationale ?? criticRationale(it.critics, finding),
    reconciledTo: finding.reconciledTo,
  };
};

/** The words of the first critic sample that reported this defect, when the wire carried none. */
function criticRationale(
  critics: readonly LensOutcome<CriticReport>[],
  finding: ConfirmedFinding,
): string | null {
  const refs = new Set(finding.locationRefs);
  for (const outcome of critics) {
    for (const raw of outcome.report?.findings ?? []) {
      if (raw.type !== finding.type) continue;
      const overlaps =
        (raw.locationRefs.length === 0 && refs.size === 0) ||
        raw.locationRefs.some((ref) => refs.has(ref));
      if (overlaps) return raw.rationale;
    }
  }
  return null;
}

function firstRationale(
  evaluators: readonly LensOutcome<EvaluationReport>[],
  criterionId: string,
): string | null {
  for (const outcome of evaluators) {
    const raw = outcome.report?.results.find((result) => result.criterionId === criterionId);
    if (raw && raw.rationale.length > 0) return raw.rationale;
  }
  return null;
}

/** A criterion result's projection alone, for callers that already hold the iteration. */
export type { CriterionResultDto };
