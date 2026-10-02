import {
  DIAGNOSTIC_DEGRADES,
  gradeStopReason,
  locationIdsIn,
  submissionLocations,
  type ConfirmedFinding,
  type CriterionEvidence,
  type CriterionResultDto,
  type CriticReport,
  type Decision,
  type DegradedSampleDto,
  type DesignSubmission,
  type EvaluationDto,
  type EvaluationFindingDto,
  type EvaluationLocationDto,
  type EvaluationReport,
  type IterationTrace,
  type LensOutcome,
  type QualityRunDto,
  type QualityRunStatus,
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
 *
 * An iteration's grade is final once the run has recorded it: a running
 * run's trace holds the iterations finished so far, so a coach's earlier
 * iterations read complete while it is still revising, and a run that failed
 * keeps the ones it recorded. Only the stop reason waits for the run to
 * stop, so the DTO says whether it has (`settled`) — and carries the reason
 * only when it is news to the grade's reader (`gradeStopReason`): a plain
 * grade ending on its one iteration is a grade finishing, not a stop.
 */
export function toEvaluationDto(
  run: QualityRunDto,
  iteration: number,
  submission: DesignSubmission,
): EvaluationDto {
  const header = { runId: run.runId, iteration, settled: run.status !== 'running', llm: run.llm };
  const it = run.trace?.iterations[iteration - 1];
  if (it === undefined) {
    const status = iterationStatus(run, iteration);
    return {
      ...header,
      status,
      overall: null,
      decision: null,
      decisionReason: null,
      dimensions: {},
      findings: [],
      criterionResults: [],
      stopReason: null,
      degraded: [],
      error:
        status === 'running'
          ? null
          : (run.error?.message ?? `the run has no iteration ${iteration}`),
    };
  }
  const index = locationIndex(submission);
  return {
    ...header,
    status: 'complete',
    ...iterationGrade(it),
    decisionReason: it.decision.reason,
    dimensions: { ...it.decision.scores.dimensions },
    findings: findingsOf(it, index),
    criterionResults: it.ledger.criteria.map((row) => toCriterionResult(row, it, index)),
    stopReason: endedRun(run, iteration)
      ? gradeStopReason(run.trace?.stopReason ?? null, run.request)
      : null,
    degraded: degradedSamples(it),
    error: null,
  };
}

/**
 * Where one iteration's grade stands: complete once the run recorded it,
 * else the run's own state — and failed when the run finished without it.
 * The one rule every reader of a revision's grade applies, so the cache and
 * the DTO never disagree.
 */
export function iterationStatus(run: QualityRunDto, iteration: number): QualityRunStatus {
  if (run.trace?.iterations[iteration - 1] !== undefined) return 'complete';
  return run.status === 'complete' ? 'failed' : run.status;
}

/**
 * The controller's verdict on one recorded iteration, as the studio states
 * it: no artifact, or a ledger with nothing assessed, earns no score — the
 * controller's zero there is not one.
 */
export function iterationGrade(it: IterationTrace): {
  overall: number | null;
  decision: Decision;
} {
  const scored = it.artifact !== null && !nothingAssessed(it.decision.scores.dimensions);
  return {
    overall: scored ? it.decision.scores.overall : null,
    decision: it.decision.finalDecision,
  };
}

/**
 * The places of a submission, by the positional id a lens cites — the same
 * numbering the canvas pipeline printed. No submission places nothing: every
 * ref is then kept verbatim and nowhere else.
 */
export const locationIndex = (
  submission: DesignSubmission | null,
): ReadonlyMap<string, SubmissionLocation> =>
  new Map(
    submission === null
      ? []
      : submissionLocations(submission).map((location) => [location.id, location]),
  );

/**
 * One iteration's confirmed findings as the studio shows them, grounded on
 * the submission the iteration judged — a revision's grade and a coach
 * iteration's row read them through this one projection.
 */
export const findingsOf = (
  it: IterationTrace,
  index: ReadonlyMap<string, SubmissionLocation>,
): EvaluationFindingDto[] => it.ledger.findings.map((finding) => toFinding(finding, it, index));

/** Why the run stopped belongs to the iteration that ended it, and only once the run has completed. */
const endedRun = (run: QualityRunDto, iteration: number): boolean =>
  run.status === 'complete' && run.trace?.iterations.length === iteration;

const nothingAssessed = (dimensions: Record<string, number | null>): boolean =>
  Object.values(dimensions).every((value) => value === null);

/**
 * Every place a lens points at: the refs it cited, then the ids its prose
 * names — in any case, runs and lists included, by the contract's grammar —
 * each once, so a reader is shown a label wherever the model wrote a position.
 */
const cited = (
  refs: readonly string[],
  prose: string | null,
  index: ReadonlyMap<string, SubmissionLocation>,
): string[] => [
  ...new Set([...refs, ...(prose === null ? [] : locationIdsIn(prose, [...index.values()]))]),
];

/** The refs the stored revision can place, each with its label, part, the author's key and the part's name. */
const placed = (
  refs: readonly string[],
  index: ReadonlyMap<string, SubmissionLocation>,
): EvaluationLocationDto[] =>
  refs.flatMap((ref) => {
    const location = index.get(ref);
    if (!location) return [];
    const { label, part, key, name } = location;
    return [{ ref, label, part, key, ...(name !== null ? { name } : {}) }];
  });

const toFinding = (
  finding: ConfirmedFinding,
  it: IterationTrace,
  index: ReadonlyMap<string, SubmissionLocation>,
): EvaluationFindingDto => {
  const rationale = finding.rationale ?? criticRationale(it.critics, finding);
  // Every place the lens cited, then every one its words name besides — a
  // sentence may say "stops at edge.4" of an edge it never cited. A ref the
  // stored revision cannot place is kept verbatim in `locationRefs` and
  // nowhere else.
  const locations = placed(cited(finding.locationRefs, rationale, index), index);
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
    rationale,
    reconciledTo: finding.reconciledTo,
  };
};

/**
 * One rubric row with the words of the first evaluator sample that gave
 * any, and every place that sample cited — its refs, then the ids its prose
 * names — so the prose reads in labels rather than positions.
 */
function toCriterionResult(
  row: CriterionEvidence,
  it: IterationTrace,
  index: ReadonlyMap<string, SubmissionLocation>,
): CriterionResultDto {
  const said = firstSaid(it.evaluators, row.criterionId);
  return {
    criterionId: row.criterionId,
    result: row.result,
    confidence: row.confidence,
    rationale: said?.rationale ?? null,
    locations: said ? placed(cited(said.locationRefs, said.rationale, index), index) : [],
  };
}

/**
 * The lens samples that should have answered and did not — what the grade was
 * computed without. A lens with nothing to judge cost the grade nothing.
 */
const degradedSamples = (it: IterationTrace): DegradedSampleDto[] =>
  [...it.critics, ...it.evaluators].flatMap(({ diagnostic }) =>
    diagnostic && DIAGNOSTIC_DEGRADES[diagnostic.reason]
      ? [{ stage: diagnostic.stage, sample: diagnostic.sample, reason: diagnostic.reason }]
      : [],
  );

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

/** The first evaluator sample's result for a criterion that carries words. */
function firstSaid(
  evaluators: readonly LensOutcome<EvaluationReport>[],
  criterionId: string,
): { rationale: string; locationRefs: readonly string[] } | null {
  for (const outcome of evaluators) {
    const raw = outcome.report?.results.find((result) => result.criterionId === criterionId);
    if (raw && raw.rationale.length > 0) return raw;
  }
  return null;
}
