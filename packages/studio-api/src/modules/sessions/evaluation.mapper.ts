import type {
  CanvasGraph,
  ConfirmedFinding,
  CriterionResultDto,
  CriticReport,
  EvaluationDto,
  EvaluationFindingDto,
  EvaluationReport,
  IterationTrace,
  LensOutcome,
  QualityRunDto,
} from '@sysdesign/contracts';

/**
 * A quality-loop run, read for one iteration, as the studio shows it. Pure:
 * the run and the graph in, the DTO out. The studio adds exactly one thing
 * to what the loop said — the mapping from the canvas pipeline's positional
 * `node.N` / `edge.N` ids back to the author's own ids, by position in the
 * graph that was graded — and invents nothing: a score, a decision or a
 * dimension the loop did not produce is null here.
 */
export function toEvaluationDto(
  run: QualityRunDto,
  iteration: number,
  graph: CanvasGraph,
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
  return {
    ...header,
    status: run.status,
    overall: it.decision.scores.overall,
    decision: it.decision.finalDecision,
    dimensions: { ...it.decision.scores.dimensions },
    findings: it.ledger.findings.map((finding) => toFinding(finding, it, graph)),
    criterionResults: it.ledger.criteria.map((row) => ({
      criterionId: row.criterionId,
      result: row.result,
      confidence: row.confidence,
      rationale: firstRationale(it.evaluators, row.criterionId),
    })),
    stopReason: run.trace.stopReason,
  };
}

const toFinding = (
  finding: ConfirmedFinding,
  it: IterationTrace,
  graph: CanvasGraph,
): EvaluationFindingDto => ({
  id: finding.key,
  lenses: [...finding.lenses],
  type: finding.type,
  severity: finding.severity,
  confidence: finding.confidence,
  fixability: finding.fixability,
  criterionIds: [...finding.criterionIds],
  nodeIds: resolve('node', finding.locationRefs, graph.nodes),
  edgeIds: resolve('edge', finding.locationRefs, graph.edges),
  locationRefs: [...finding.locationRefs],
  rationale: finding.rationale ?? criticRationale(it.critics, finding),
  reconciledTo: finding.reconciledTo,
});

/** `node.3` → the third node's id; a position past the end names nothing and is dropped. */
function resolve(
  prefix: 'node' | 'edge',
  refs: readonly string[],
  items: readonly { id: string }[],
): string[] {
  const pattern = new RegExp(`^${prefix}\\.(\\d+)$`);
  return refs.flatMap((ref) => {
    const match = pattern.exec(ref);
    if (!match) return [];
    const item = items[Number(match[1]) - 1];
    return item ? [item.id] : [];
  });
}

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
