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
  type DecisionBasisDto,
  type DegradedSampleDto,
  type DesignSubmission,
  type EvaluationDto,
  type EvaluationFindingDto,
  type EvaluationLocationDto,
  type EvaluationReport,
  type IsoDateString,
  type IterationTrace,
  type LensOutcome,
  type QualityRunDto,
  type QualityRunStatus,
  type SubmissionLocation,
  type UnscoredReason,
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
 * grade ending on its one iteration is a grade finishing, not a stop. The
 * instant the run was read is the caller's to say (`readAt`), on the
 * server's clock, so a reader measures the run's times against it.
 */
export function toEvaluationDto(
  run: QualityRunDto,
  iteration: number,
  submission: DesignSubmission,
  readAt: IsoDateString,
): EvaluationDto {
  const header = {
    runId: run.runId,
    iteration,
    startedAt: run.startedAt,
    heartbeatAt: run.heartbeatAt,
    readAt,
    settled: run.status !== 'running',
    llm: run.llm,
  };
  const it = run.trace?.iterations[iteration - 1];
  if (it === undefined) {
    const status = iterationStatus(run, iteration);
    return {
      ...header,
      status,
      overall: null,
      unscored: null,
      decision: null,
      decisionReason: null,
      decisionBasis: null,
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
  const grade = iterationGrade(it);
  return {
    ...header,
    status: 'complete',
    ...grade,
    decisionReason: it.decision.reason,
    decisionBasis: decisionBasisOf(it),
    // A grade that earned no score assessed no dimension either: the
    // controller's numbers there are what an empty ledger prices at.
    dimensions: Object.fromEntries(
      Object.entries(it.decision.scores.dimensions).map(([dimension, value]) => [
        dimension,
        grade.unscored === null ? value : null,
      ]),
    ),
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
 * it: no artifact, or a ledger the loop's evidence gate found too thin for a
 * verdict, earns no score — the controller's number there is not one.
 */
export function iterationGrade(it: IterationTrace): {
  overall: number | null;
  unscored: UnscoredReason | null;
  decision: Decision;
} {
  const unscored = unscoredReason(it);
  return {
    overall: unscored === null ? it.decision.scores.overall : null,
    unscored,
    decision: it.decision.finalDecision,
  };
}

/**
 * Why an iteration earned no score, read from the engine's own gates — the
 * facts every controller is handed — never from a threshold of the studio's:
 * nothing to judge, or too few criteria assessed for the evidence to be
 * sufficient (a ledger with no dimension assessed at all is the extreme of
 * that). Null when the grade is a verdict.
 */
export function unscoredReason(it: IterationTrace): UnscoredReason | null {
  if (it.artifact === null || !it.decision.gates.artifactPresent) return 'no-artifact';
  if (!it.decision.gates.evidenceSufficient || nothingAssessed(it.decision.scores.dimensions)) {
    return 'unassessed';
  }
  return null;
}

/**
 * What settled an iteration's decision, as data: the controller step that
 * decided, how many remediations it selected, how many criteria were
 * assessed. The reader words it; the controller's sentence stays its trace's.
 */
export function decisionBasisOf(it: IterationTrace): DecisionBasisDto {
  const decided = it.decision.trace.steps.find((step) => step.outcome === 'decided');
  const { criteria } = it.ledger;
  return {
    factor: decided?.factor ?? null,
    remediations: it.decision.selectedRemediations.length,
    criteria: {
      assessed: criteria.filter((row) => row.result !== 'unassessed').length,
      total: criteria.length,
    },
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

/**
 * Where a lens pointed, in two lists that are never merged. `locations` is
 * what it CITED — by ref — that the revision can place: the finding's ground.
 * `mentions` is every other place its prose names — in any case, runs and
 * lists included, by the contract's grammar — placed the same way, so the
 * sentence reads in labels: a lens that says "stops at edge.4" of an edge it
 * never cited has not found anything at edge.4. A ref the revision cannot
 * place is kept verbatim in `locationRefs` and nowhere else.
 */
const pointed = (
  refs: readonly string[],
  prose: string | null,
  index: ReadonlyMap<string, SubmissionLocation>,
): { locations: EvaluationLocationDto[]; mentions: EvaluationLocationDto[] } => {
  const cited = new Set(refs);
  const named = prose === null ? [] : locationIdsIn(prose, [...index.values()]);
  return {
    locations: placed([...cited], index),
    mentions: placed(
      named.filter((ref) => !cited.has(ref)),
      index,
    ),
  };
};

const toFinding = (
  finding: ConfirmedFinding,
  it: IterationTrace,
  index: ReadonlyMap<string, SubmissionLocation>,
): EvaluationFindingDto => {
  const rationale = finding.rationale ?? criticRationale(it.critics, finding);
  const { locations, mentions } = pointed(finding.locationRefs, rationale, index);
  // The canvas highlights what the finding is about: the cited places only.
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
    mentions,
    nodeIds: keysOf('node'),
    edgeIds: keysOf('edge'),
    locationRefs: [...finding.locationRefs],
    rationale,
    reconciledTo: finding.reconciledTo,
  };
};

/**
 * One rubric row with the words of the first evaluator sample that gave
 * any: the places that sample cited as its evidence, and the ones its prose
 * names besides, so the prose reads in labels rather than positions.
 */
function toCriterionResult(
  row: CriterionEvidence,
  it: IterationTrace,
  index: ReadonlyMap<string, SubmissionLocation>,
): CriterionResultDto {
  // A criterion no lens settled carries no lens's words: a lone sample's
  // rationale beside "unassessed" reads as a verdict that was then thrown away.
  const said = row.result === 'unassessed' ? null : firstSaid(it.evaluators, row.criterionId);
  const { locations, mentions } = said
    ? pointed(said.locationRefs, said.rationale, index)
    : { locations: [], mentions: [] };
  return {
    criterionId: row.criterionId,
    result: row.result,
    confidence: row.confidence,
    rationale: said?.rationale ?? null,
    locations,
    mentions,
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
