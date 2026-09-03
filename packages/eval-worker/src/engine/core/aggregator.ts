/**
 * The pure decision point: evidence artifacts + a profile in, scores, grade,
 * and summary out. Only findings and coverage feed the score math — axis,
 * scenario, and annotation artifacts pass through untouched, which is the
 * structural guarantee that LLM output can never move the deterministic
 * grade. No clock, no randomness: identical inputs, byte-identical result.
 *
 * The arithmetic is done ONCE, by `explainAggregate`, which returns both the
 * numbers and the ledger that produced them. `aggregate` reads that ledger
 * rather than recomputing, so the trace a run dump stores cannot disagree with
 * the score a candidate is given — a separately-maintained explainer would only
 * hold that property until someone skipped a spec.
 */
import {
  AXIS_FACTOR_LEVELS,
  EVAL_DIMENSIONS,
  type AxisFactorLevel,
  type DimensionScores,
  type EvalDimension,
  type Grade,
  type Severity,
} from '@sysdesign/contracts';

import type {
  AnnotationArtifact,
  AxisArtifact,
  CoverageArtifact,
  DiagnosticsArtifact,
  EngineFinding,
  EvidenceArtifact,
  GradedEvidenceItem,
  ScenarioArtifact,
} from './artifacts';
import { gradeForScore, type CoverageScoringPolicy, type EvalProfile } from './profile';

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Ordinal → weight in [0, 1], the same anchors the workability axis uses
 * (LEVEL_SCORE/100). A graded weakness's price scales by its magnitude AND the
 * lens's confidence, so a hedged low-magnitude call barely moves the score and
 * only a confident high-magnitude one approaches the per-item cap.
 */
const LEVEL_WEIGHT: Record<AxisFactorLevel, number> = { none: 0, low: 0.33, medium: 0.67, high: 1 };

/** Higher ordinal ranks first — worst weaknesses charged before decay bites. */
const LEVEL_RANK: Record<AxisFactorLevel, number> = Object.fromEntries(
  AXIS_FACTOR_LEVELS.map((level, index) => [level, AXIS_FACTOR_LEVELS.length - index]),
) as Record<AxisFactorLevel, number>;

/** A graded weakness carried with the lens that raised it, for scoring + trace. */
export interface CollectedGradedItem extends GradedEvidenceItem {
  lens: string;
}

/**
 * The cap that bound the grade — a SEVERITY cap (`count` findings of `severity`)
 * or an EXPECTATION cap (an unmet `expectationId`, e.g. no top grade without a
 * walkthrough). Mutually exclusive; structurally compatible with `CapAppliedDto`.
 */
export interface CapApplied {
  maxGrade: Grade;
  severity?: Severity;
  count?: number;
  expectationId?: string;
}

/** One violation's actual cost, at the decay position it was charged at. */
export interface PenaltyTrace {
  /** 0-based: the multiplier applied was `violationDecay ** position`. */
  position: number;
  severity: Severity;
  ruleId: string | null;
  expectationId: string | null;
  affectedNodeIds: string[];
  /** Full price before decay. */
  listPoints: number;
  /** What it actually subtracted. */
  points: number;
}

/** One graded weakness's actual cost, at the decay position it was charged at. */
export interface GradedPenaltyTrace {
  /** 0-based: the multiplier applied was `gradedEvidence.decay ** position`. */
  position: number;
  lens: string;
  level: AxisFactorLevel;
  confidence: AxisFactorLevel;
  requirementId: string | null;
  affectedNodeIds: string[];
  /** Full price before decay: maxPointsPerItem × w(level) × w(confidence). */
  listPoints: number;
  /** What it actually subtracted, after decay and the per-dimension clamp. */
  points: number;
}

export interface DimensionTrace {
  dimension: EvalDimension;
  /** Applicable expectations examined; 0 with no violations means unassessed. */
  entries: number;
  met: number;
  total: number;
  /** `100 * met / total`, or null when the dimension was not assessed. */
  base: number | null;
  penalties: PenaltyTrace[];
  /** Graded LLM-lens subtractions, empty on the deterministic path. */
  gradedPenalties: GradedPenaltyTrace[];
  score: number | null;
  /** The weight it contributed to the overall, or null when unassessed. */
  weight: number | null;
}

export interface SuppressionTrace {
  ruleId: string;
  whenExpectationUnmet: string;
  /** The finding this silenced, so a reader can see what was not said. */
  droppedTitle: string;
}

/** Every severity cap the policy evaluated — including the ones that did not bind. */
export interface CapTrace {
  severity: Severity;
  atLeast: number;
  maxGrade: Grade;
  count: number;
  reached: boolean;
  binding: boolean;
}

/** Every expectation cap the policy evaluated — including the ones that did not bind. */
export interface ExpectationCapTrace {
  whenExpectationUnmet: string;
  maxGrade: Grade;
  reached: boolean;
  binding: boolean;
}

export interface AggregateTrace {
  dimensions: DimensionTrace[];
  /** Renormalised over assessed dimensions only. */
  weightSum: number;
  /** Sum of score × weight, before division and rounding. */
  weightedTotal: number;
  overallScore: number;
  suppressions: SuppressionTrace[];
  caps: CapTrace[];
  /** Expectation-keyed caps, traced beside the severity caps. */
  expectationCaps: ExpectationCapTrace[];
  bandGrade: Grade;
  grade: Grade;
}

export interface AggregateResult {
  findings: EngineFinding[];
  dimensionScores: DimensionScores;
  overallScore: number;
  /** Grade the numeric bands alone would give, before any cap. */
  bandGrade: Grade;
  grade: Grade;
  capApplied: CapApplied | null;
  summary: string;
  axes: AxisArtifact[];
  scenarios: ScenarioArtifact | null;
  annotations: AnnotationArtifact | null;
  diagnostics: DiagnosticsArtifact[];
  /** How the numbers above were arrived at. Derived from the same pass. */
  trace: AggregateTrace;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable identity for sorting: rules have ruleIds, expectations have expectationIds. */
function sortKey(finding: EngineFinding): string {
  return finding.ruleId ?? finding.expectationId ?? '';
}

const GRADE_ORDER: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

interface Collected {
  findings: EngineFinding[];
  coverage: CoverageArtifact['entries'];
  gradedEvidence: CollectedGradedItem[];
  axes: AxisArtifact[];
  diagnostics: DiagnosticsArtifact[];
  annotations: AnnotationArtifact | null;
  scenarios: ScenarioArtifact | null;
}

function collect(artifacts: readonly EvidenceArtifact[]): Collected {
  const findings: EngineFinding[] = [];
  const coverage: CoverageArtifact['entries'] = [];
  const gradedEvidence: CollectedGradedItem[] = [];
  const axes: AxisArtifact[] = [];
  const diagnostics: DiagnosticsArtifact[] = [];
  const annotationArtifacts: AnnotationArtifact[] = [];
  let scenarios: ScenarioArtifact | null = null;

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'findings':
        findings.push(...artifact.findings);
        break;
      case 'coverage':
        coverage.push(...artifact.entries);
        break;
      case 'graded-evidence':
        for (const item of artifact.items) gradedEvidence.push({ ...item, lens: artifact.lens });
        break;
      case 'axis':
        axes.push(artifact);
        break;
      case 'scenarios':
        scenarios ??= artifact;
        break;
      case 'annotations':
        annotationArtifacts.push(artifact);
        break;
      case 'diagnostics':
        diagnostics.push(artifact);
        break;
    }
  }

  // Annotation artifacts merge in artifact order: findings concatenate, but
  // the FIRST artifact's identity/summary/model win — the general critic
  // runs before the narrative critic and owns the evaluation summary.
  const first = annotationArtifacts[0];
  const annotations: AnnotationArtifact | null =
    first === undefined
      ? null
      : annotationArtifacts.length === 1
        ? first
        : { ...first, findings: annotationArtifacts.flatMap((artifact) => artifact.findings) };

  return { findings, coverage, gradedEvidence, axes, diagnostics, annotations, scenarios };
}

export interface Explanation {
  /** Post-suppression, in the result's stable order. */
  findings: EngineFinding[];
  dimensionScores: DimensionScores;
  overallScore: number;
  bandGrade: Grade;
  grade: Grade;
  capApplied: CapApplied | null;
  trace: AggregateTrace;
}

/**
 * The whole score, and the ledger behind it, computed together.
 *
 * Exported so a run dump can be explained without re-deriving anything — and
 * so the scoring math has exactly one implementation.
 */
export function explainAggregate(
  artifacts: readonly EvidenceArtifact[],
  profile: EvalProfile,
): Explanation {
  const policy = profile.scoring;
  const { findings: raw, coverage, gradedEvidence } = collect(artifacts);

  const { kept, suppressions } = applySuppressions(raw, coverage, policy);
  const findings = [...kept].sort(
    (a, b) =>
      compareStrings(sortKey(a), sortKey(b)) ||
      compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')),
  );

  const dimensions = scoreCoverage(findings, coverage, gradedEvidence, policy);
  const dimensionScores = {} as DimensionScores;
  for (const entry of dimensions) dimensionScores[entry.dimension] = entry.score;

  // Weights renormalize over the assessed dimensions, so a prompt that
  // assesses five is graded out of those five.
  let weightedTotal = 0;
  let weightSum = 0;
  for (const entry of dimensions) {
    if (entry.score === null || entry.weight === null) continue;
    weightedTotal += entry.score * entry.weight;
    weightSum += entry.weight;
  }
  // With nothing covered there is no evidence of any kind, and no evidence
  // earns 0.
  const overallScore = weightSum === 0 ? 0 : Math.round((weightedTotal / weightSum) * 10) / 10;

  const bandGrade = gradeForScore(overallScore, policy.gradeBands);
  const { grade, capApplied, caps, expectationCaps } = applyGradeCaps(
    bandGrade,
    findings,
    coverage,
    policy,
  );

  return {
    findings,
    dimensionScores,
    overallScore,
    bandGrade,
    grade,
    capApplied,
    trace: {
      dimensions,
      weightSum,
      weightedTotal,
      overallScore,
      suppressions,
      caps,
      expectationCaps,
      bandGrade,
      grade,
    },
  };
}

export function aggregate(
  artifacts: readonly EvidenceArtifact[],
  profile: EvalProfile,
): AggregateResult {
  const { axes, diagnostics, annotations, scenarios } = collect(artifacts);
  const explained = explainAggregate(artifacts, profile);

  return {
    findings: explained.findings,
    dimensionScores: explained.dimensionScores,
    overallScore: explained.overallScore,
    bandGrade: explained.bandGrade,
    grade: explained.grade,
    capApplied: explained.capApplied,
    summary: composeSummary(
      explained.findings,
      explained.dimensionScores,
      explained.overallScore,
      explained.grade,
    ),
    axes,
    scenarios,
    annotations,
    diagnostics,
    trace: explained.trace,
  };
}

/**
 * One lesson, one finding: a rule finding is dropped when the policy pairs it
 * with an expectation the design leaves unmet — the unmet expectation already
 * carries the lesson (and the fix), so the rule would only double-charge it.
 */
function applySuppressions(
  findings: readonly EngineFinding[],
  coverage: CoverageArtifact['entries'],
  policy: CoverageScoringPolicy,
): { kept: EngineFinding[]; suppressions: SuppressionTrace[] } {
  if (policy.suppressions.length === 0) return { kept: [...findings], suppressions: [] };

  const unmet = new Set(coverage.filter((entry) => !entry.met).map((entry) => entry.expectationId));
  const kept: EngineFinding[] = [];
  const suppressions: SuppressionTrace[] = [];

  for (const finding of findings) {
    const rule = finding.ruleId
      ? policy.suppressions.find(
          (candidate) =>
            candidate.ruleId === finding.ruleId && unmet.has(candidate.whenExpectationUnmet),
        )
      : undefined;
    if (rule === undefined) {
      kept.push(finding);
      continue;
    }
    suppressions.push({
      ruleId: rule.ruleId,
      whenExpectationUnmet: rule.whenExpectationUnmet,
      droppedTitle: finding.title,
    });
  }

  return { kept, suppressions };
}

/**
 * Coverage model: the base is earned — 100 × met weight / total weight over
 * the prompt's applicable expectations — then rule violations subtract with
 * geometric decay, and grounded LLM-lens weaknesses subtract a second, bounded
 * term (see `scoreGradedPenalty`). A dimension is covered only when at least one
 * applicable expectation or one violation examined it; anything else scores null
 * and drops out of the overall, so an unexamined dimension is never a free 100 —
 * and graded evidence is weakness-ONLY, so it can lower an already-assessed
 * dimension but never lift an unassessed one out of null (a lens's evidence
 * alone must not decide a dimension was assessed).
 */
function scoreCoverage(
  findings: readonly EngineFinding[],
  coverage: CoverageArtifact['entries'],
  gradedEvidence: readonly CollectedGradedItem[],
  policy: CoverageScoringPolicy,
): DimensionTrace[] {
  const earned = {} as Record<EvalDimension, { met: number; total: number; entries: number }>;
  for (const dimension of EVAL_DIMENSIONS) earned[dimension] = { met: 0, total: 0, entries: 0 };
  for (const entry of coverage) {
    earned[entry.dimension].total += entry.weight;
    earned[entry.dimension].entries += 1;
    if (entry.met) earned[entry.dimension].met += entry.weight;
  }

  const violations = {} as Record<EvalDimension, EngineFinding[]>;
  for (const dimension of EVAL_DIMENSIONS) violations[dimension] = [];
  for (const finding of findings) {
    if (finding.countsAsViolation) violations[finding.dimension].push(finding);
  }

  const graded = {} as Record<EvalDimension, CollectedGradedItem[]>;
  for (const dimension of EVAL_DIMENSIONS) graded[dimension] = [];
  for (const item of gradedEvidence) graded[item.dimension].push(item);

  return EVAL_DIMENSIONS.map((dimension) => {
    const { met, total, entries } = earned[dimension];
    if (entries === 0 && violations[dimension].length === 0) {
      return {
        dimension,
        entries,
        met,
        total,
        base: null,
        penalties: [],
        gradedPenalties: [],
        score: null,
        weight: null,
      };
    }
    const base = total > 0 ? (100 * met) / total : 100;

    // Deterministic penalty order: worst first, then stable identity. This is
    // NOT the order `findings` ends up in — that sort carries no severity term —
    // which is why the position each penalty was charged at has to be recorded
    // here or it is unrecoverable.
    const ordered = [...violations[dimension]].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        compareStrings(sortKey(a), sortKey(b)) ||
        compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')),
    );

    let penalty = 0;
    const penalties = ordered.map((finding, position) => {
      const listPoints = policy.violationPenalties[finding.severity];
      const points = listPoints * policy.violationDecay ** position;
      penalty += points;
      return {
        position,
        severity: finding.severity,
        ruleId: finding.ruleId,
        expectationId: finding.expectationId,
        affectedNodeIds: finding.affectedNodeIds,
        listPoints,
        points,
      };
    });

    const gradedPenalties = scoreGradedPenalty(graded[dimension], policy.gradedEvidence);
    const gradedPenalty = gradedPenalties.reduce((sum, item) => sum + item.points, 0);

    const score = Math.round(Math.max(0, base - penalty - gradedPenalty) * 10) / 10;
    return {
      dimension,
      entries,
      met,
      total,
      base,
      penalties,
      gradedPenalties,
      score,
      weight: policy.dimensionWeights[dimension],
    };
  });
}

/**
 * The generic, engine-owned graded scorer: a bounded weakness-only subtraction
 * from one dimension. Each weakness's list price is `maxPointsPerItem` scaled by
 * its magnitude AND the lens's confidence (so a hedged low call barely counts);
 * they charge worst-first with geometric decay, and the total is clamped to
 * `maxPenaltyPerDimension`. The clamp is distributed back over the trace pro rata
 * so the recorded `points` always sum to what was actually subtracted. Pure
 * ordinals in, points out — the LLM never picks a number, and 'none'/'none'
 * items contribute exactly 0.
 */
function scoreGradedPenalty(
  items: readonly CollectedGradedItem[],
  policy: CoverageScoringPolicy['gradedEvidence'],
): GradedPenaltyTrace[] {
  const ordered = [...items].sort(
    (a, b) =>
      LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
      LEVEL_RANK[b.confidence] - LEVEL_RANK[a.confidence] ||
      compareStrings(a.requirementId ?? '', b.requirementId ?? '') ||
      compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')) ||
      compareStrings(a.lens, b.lens),
  );

  let running = 0;
  const raw = ordered.map((item, position) => {
    const listPoints =
      policy.maxPointsPerItem * LEVEL_WEIGHT[item.level] * LEVEL_WEIGHT[item.confidence];
    const decayed = listPoints * policy.decay ** position;
    running += decayed;
    return { item, position, listPoints, decayed };
  });

  const total = running;
  // Distribute the per-dimension clamp pro rata so the trace's points sum to the
  // actual subtraction even when the cap bites.
  const scale = total > policy.maxPenaltyPerDimension ? policy.maxPenaltyPerDimension / total : 1;
  return raw.map(({ item, position, listPoints, decayed }) => ({
    position,
    lens: item.lens,
    level: item.level,
    confidence: item.confidence,
    requirementId: item.requirementId,
    affectedNodeIds: item.affectedNodeIds,
    listPoints,
    points: decayed * scale,
  }));
}

/**
 * A grave problem caps the letter no matter how the numbers average out — an
 * interviewer does not hand out an A over an unaddressed single point of
 * failure, nor over a design its author never explained. Two kinds of cap:
 * severity caps (N deterministic findings of a severity) and expectation caps
 * (a specific expectation left unmet, read from the coverage ledger). Both count
 * deterministic evidence only; LLM output never reaches here. The strictest
 * reached cap of either kind wins.
 */
function applyGradeCaps(
  bandGrade: Grade,
  findings: readonly EngineFinding[],
  coverage: CoverageArtifact['entries'],
  policy: CoverageScoringPolicy,
): {
  grade: Grade;
  capApplied: CapApplied | null;
  caps: CapTrace[];
  expectationCaps: ExpectationCapTrace[];
} {
  // Every cap is counted, including the ones that will not bind — a reader
  // asking "why was this an A?" needs to see the caps that were checked and
  // came up short, not only the one that fired.
  const evaluated = policy.gradeCaps.map((cap) => {
    const count = findings.filter((finding) => finding.severity === cap.severity).length;
    return { ...cap, count, reached: count >= cap.atLeast };
  });
  const unmetExpectations = new Set(
    coverage.filter((entry) => !entry.met).map((entry) => entry.expectationId),
  );
  const evaluatedExpectation = policy.expectationGradeCaps.map((cap) => ({
    ...cap,
    reached: unmetExpectations.has(cap.whenExpectationUnmet),
  }));

  // The strictest reached cap wins, across both kinds. Each candidate carries
  // the `capApplied` it would produce, so the winner needs no re-derivation.
  type Candidate = { maxGrade: Grade; capApplied: CapApplied; ref: unknown };
  const candidates: Candidate[] = [
    ...evaluated
      .filter((cap) => cap.reached)
      .map((cap) => ({
        maxGrade: cap.maxGrade,
        capApplied: { severity: cap.severity, count: cap.count, maxGrade: cap.maxGrade },
        ref: cap,
      })),
    ...evaluatedExpectation
      .filter((cap) => cap.reached)
      .map((cap) => ({
        maxGrade: cap.maxGrade,
        capApplied: { expectationId: cap.whenExpectationUnmet, maxGrade: cap.maxGrade },
        ref: cap,
      })),
  ];

  let strictest: Candidate | null = null;
  for (const candidate of candidates) {
    if (strictest === null || GRADE_ORDER[candidate.maxGrade] < GRADE_ORDER[strictest.maxGrade]) {
      strictest = candidate;
    }
  }

  const applies = strictest !== null && GRADE_ORDER[bandGrade] > GRADE_ORDER[strictest.maxGrade];
  const caps: CapTrace[] = evaluated.map((cap) => ({
    ...cap,
    binding: applies && strictest?.ref === cap,
  }));
  const expectationCaps: ExpectationCapTrace[] = evaluatedExpectation.map((cap) => ({
    whenExpectationUnmet: cap.whenExpectationUnmet,
    maxGrade: cap.maxGrade,
    reached: cap.reached,
    binding: applies && strictest?.ref === cap,
  }));

  if (!applies || strictest === null) {
    return { grade: bandGrade, capApplied: null, caps, expectationCaps };
  }
  return { grade: strictest.maxGrade, capApplied: strictest.capApplied, caps, expectationCaps };
}

function composeSummary(
  findings: readonly EngineFinding[],
  scores: DimensionScores,
  overall: number,
  grade: Grade,
): string {
  // Info findings are footnotes, not problems — the summary leads with what hurts.
  const actionable = findings
    .filter((finding) => finding.severity !== 'info')
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        compareStrings(sortKey(a), sortKey(b)),
    );

  // Null dimensions were never assessed — they cannot be anyone's strongest.
  let strongest: EvalDimension | null = null;
  for (const dimension of EVAL_DIMENSIONS) {
    const score = scores[dimension];
    if (score === null) continue;
    if (strongest === null || score > (scores[strongest] as number)) strongest = dimension;
  }

  if (strongest === null) {
    return `No dimension was assessed — the prompt produced no applicable expectations and no findings. Overall ${overall}/100, grade ${grade}.`;
  }

  if (actionable.length === 0) {
    // Deliberately narrower than it used to be. This said "the design covers
    // the load-bearing concerns for this prompt", which claims something the
    // engine cannot know: it checked what it models, and cost, rollout, schema
    // design and team shape are not among them. A teaching tool that overclaims
    // at full marks teaches the wrong lesson.
    return `Nothing this rubric checks is missing — every assessed dimension holds at or near full marks, led by ${strongest} at ${scores[strongest]}/100. That is not the same as a finished design: cost, rollout, data modelling and operability sit outside what this can see. Overall ${overall}/100, grade ${grade}.`;
  }

  const topTitles = actionable.slice(0, 3).map((finding) => finding.title);
  const needs = actionable.length === 1 ? 'issue needs' : 'issues need';
  return `${actionable.length} ${needs} attention, led by: ${topTitles.join('; ')}. The strongest dimension is ${strongest} at ${scores[strongest]}/100. Overall ${overall}/100, grade ${grade}.`;
}
