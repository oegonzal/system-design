/**
 * What every gate reads: the ledger priced once. Scores are a total function
 * of the ledger and are traced whether or not a gate fires; the four facts
 * are the engine's, computed the same way under every controller; the
 * remediations are everything the producer could act on, worst first. A gate
 * observes this context and gives a verdict — it never edits it. Only what
 * `minHits` samples agreed on can block: an item confirmed short of them
 * (a lens that lost a sample) is priced and never a blocker. Under a policy
 * that asks for corroboration, a blocker that cites criteria must also be
 * borne out by the evaluator — a gating criterion it cites, failed — or it is
 * priced and never a blocker either: one sample of one lens is one opinion,
 * and two judges reading one fact apart is the agreement that sample cannot
 * supply for itself. A validation problem of severity `info` — a field past
 * the size it was asked for — informs and is never acted on, so it moves no
 * route.
 */
import { REFUSING_GATES } from '@sysdesign/contracts';
import type {
  ConfirmedFinding,
  CriterionEvidence,
  DecisionPolicy,
  DimensionTrace,
  EvidenceLedger,
  Gates,
  Remediation,
  Severity,
  ValidationReport,
} from '@sysdesign/contracts';

import { round1, round4, sum } from '../arithmetic';
import { compareFindings, compareStrings, severityRank, unique } from '../evidence/ordering';

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Ordering severities for criterion shortfalls in the remediation list; never priced. */
const SHORTFALL_SEVERITY: Record<'fail' | 'partial', Severity> = {
  fail: 'high',
  partial: 'medium',
};

export interface Scored {
  dimensions: DimensionTrace[];
  weightSum: number;
  weightedTotal: number;
  overall: number;
}

export interface GateContext {
  ledger: EvidenceLedger;
  policy: DecisionPolicy;
  scored: Scored;
  /** The engine's facts about the evidence — the same under every controller. */
  gates: Gates;
  /** What each closed fact names. */
  blocking: {
    validators: ValidationReport[];
    findings: ConfirmedFinding[];
    criteria: CriterionEvidence[];
  };
  assessedShare: number;
  remediations: Remediation[];
}

type PricedCriterion = DimensionTrace['criteria'][number];
type Penalty = DimensionTrace['penalties'][number];

// ---- scoring --------------------------------------------------------------

/** What a settled result earns of its criterion's weight; nothing when nobody assessed it. */
const resultValue = (policy: DecisionPolicy, evidence: CriterionEvidence): number =>
  evidence.result === 'unassessed' || evidence.result === 'not_applicable'
    ? 0
    : policy.resultValues[evidence.result];

/** The criteria that land on a dimension, each with its weight and what it earned. */
function priceCriteria(
  ledger: EvidenceLedger,
  policy: DecisionPolicy,
  dimension: string,
): PricedCriterion[] {
  return ledger.criteria
    .filter(
      (evidence) =>
        policy.criterionKinds[evidence.kind].dimension === dimension &&
        evidence.result !== 'not_applicable',
    )
    .map((evidence) => ({
      criterionId: evidence.criterionId,
      kind: evidence.kind,
      weight: policy.criterionKinds[evidence.kind].weight,
      result: evidence.result,
      value: resultValue(policy, evidence),
    }));
}

/**
 * The charge for a dimension's findings, worst first: severity points weighed
 * by confidence, decayed down the list, then scaled so the total never exceeds
 * the policy's cap per dimension.
 */
function chargeFindings(
  findings: readonly ConfirmedFinding[],
  policy: DecisionPolicy,
  contradicted: ReadonlySet<string>,
): { penalties: Penalty[]; penaltyTotal: number; clampScale: number } {
  const { bySeverity, decay, maxPerDimension } = policy.penalties;
  const discount = policy.penalties.contradicted ?? 1;
  const penalties = findings.map((finding, position): Penalty => {
    const listPoints =
      bySeverity[finding.severity] *
      policy.confidenceWeights[finding.confidence] *
      (contradicted.has(finding.key) ? discount : 1);
    const decayed = listPoints * decay ** position;
    return {
      key: finding.key,
      position,
      severity: finding.severity,
      confidence: finding.confidence,
      listPoints: round1(listPoints),
      decayed: round1(decayed),
      points: decayed,
    };
  });
  const rawTotal = sum(penalties.map((penalty) => penalty.points));
  const clampScale = rawTotal > maxPerDimension ? maxPerDimension / rawTotal : 1;
  for (const penalty of penalties) penalty.points = round1(penalty.points * clampScale);
  return { penalties, penaltyTotal: rawTotal * clampScale, clampScale };
}

/** One dimension priced: what its criteria earned, less what its findings cost, clamped to the scale. */
function scoreDimension(
  ledger: EvidenceLedger,
  chargeable: readonly ConfirmedFinding[],
  policy: DecisionPolicy,
  dimension: string,
  contradicted: ReadonlySet<string>,
): DimensionTrace {
  const criteria = priceCriteria(ledger, policy, dimension);
  const totalWeight = sum(criteria.map((criterion) => criterion.weight));
  const earned = sum(criteria.map((criterion) => criterion.weight * (criterion.value ?? 0)));

  const findings = chargeable
    .filter((finding) => policy.findingTypes[finding.type].dimension === dimension)
    .sort(compareFindings);
  const base =
    criteria.length > 0 ? (100 * earned) / totalWeight : findings.length > 0 ? 100 : null;

  const { penalties, penaltyTotal, clampScale } = chargeFindings(findings, policy, contradicted);
  const score = base === null ? null : round1(clamp(base - penaltyTotal, SCORE_MIN, SCORE_MAX));

  return {
    dimension,
    weight: score === null ? null : policy.dimensionWeights[dimension],
    criteria,
    base: base === null ? null : round1(base),
    penalties,
    penaltyTotal: round1(penaltyTotal),
    clampScale: round4(clampScale),
    score,
  };
}

/** The weighted overall over the dimensions that were assessed at all. */
function weighOverall(dimensions: DimensionTrace[]): Scored {
  const assessed = dimensions.flatMap((trace) =>
    trace.score !== null && trace.weight !== null
      ? [{ score: trace.score, weight: trace.weight }]
      : [],
  );
  const weightSum = sum(assessed.map((trace) => trace.weight));
  const weightedTotal = sum(assessed.map((trace) => trace.score * trace.weight));
  return {
    dimensions,
    weightSum,
    weightedTotal,
    overall: weightSum > 0 ? round1(weightedTotal / weightSum) : 0,
  };
}

function scoreDimensions(
  ledger: EvidenceLedger,
  policy: DecisionPolicy,
  contradicted: ReadonlySet<string>,
): Scored {
  const chargeable = ledger.findings.filter((finding) => finding.reconciledTo === null);
  return weighOverall(
    Object.keys(policy.dimensionWeights).map((dimension) =>
      scoreDimension(ledger, chargeable, policy, dimension, contradicted),
    ),
  );
}

/**
 * The findings the evaluator contradicted, under a policy that asks for
 * corroboration: each cites at least one criterion, and every criterion it
 * cites was judged pass or not applicable — the judge of that very fact read
 * it the other way. Nothing is contradicted under `none`, and a finding that
 * cites nothing, or cites a criterion nobody judged, is not.
 */
function contradictedFindings(ledger: EvidenceLedger, policy: DecisionPolicy): Set<string> {
  if ((policy.evidence.corroboration ?? 'none') === 'none') return new Set();
  const settled = new Map(
    ledger.criteria.map((evidence) => [evidence.criterionId, evidence.result]),
  );
  return new Set(
    ledger.findings
      .filter(
        (finding) =>
          finding.criterionIds.length > 0 &&
          finding.criterionIds.every((id) => {
            const result = settled.get(id);
            return result === 'pass' || result === 'not_applicable';
          }),
      )
      .map((finding) => finding.key),
  );
}

// ---- remediations ---------------------------------------------------------

const findingRemediations = (ledger: EvidenceLedger): Remediation[] =>
  ledger.findings
    .filter(
      (finding) =>
        finding.fixability === 'fixable_local' || finding.fixability === 'requires_retry',
    )
    .map((finding) => ({
      subject: { finding: finding.key },
      action: finding.fixability === 'fixable_local' ? 'revise' : 'retry',
      severity: finding.severity,
      targetRefs: finding.locationRefs,
    }));

const criterionRemediations = (ledger: EvidenceLedger): Remediation[] =>
  ledger.criteria
    .filter((evidence) => evidence.result === 'fail' || evidence.result === 'partial')
    .map((evidence) => ({
      subject: { criterion: evidence.criterionId },
      action: 'revise',
      severity: SHORTFALL_SEVERITY[evidence.result as 'fail' | 'partial'],
      targetRefs: evidence.locationRefs,
    }));

/**
 * A validation problem the producer is asked to act on: anything above
 * `info`, which only informs. The one predicate for what the controller
 * counts of a warning, so whatever tells a judge what was already counted
 * selects with it rather than listing its own.
 */
export const actionable = (problem: ValidationReport['problems'][number]): boolean =>
  problem.severity !== 'info';

const validatorRemediations = (ledger: EvidenceLedger): Remediation[] =>
  ledger.validation
    .map((report) => ({ report, problems: report.problems.filter(actionable) }))
    .filter(({ problems }) => problems.length > 0)
    .map(({ report, problems }) => ({
      subject: { validator: report.validatorId },
      action: report.gate === 'block' ? 'retry' : 'revise',
      severity: [...problems].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0]
        .severity,
      targetRefs: unique(problems.flatMap((problem) => problem.locationRefs)).sort(compareStrings),
    }));

const subjectKey = (remediation: Remediation): string => Object.values(remediation.subject)[0];

const worstFirst = (a: Remediation, b: Remediation): number =>
  severityRank(a.severity) - severityRank(b.severity) ||
  compareStrings(subjectKey(a), subjectKey(b));

/** Everything the producer could act on, worst first. Pricing and fixing are different questions. */
const selectRemediations = (ledger: EvidenceLedger): Remediation[] =>
  [
    ...validatorRemediations(ledger),
    ...findingRemediations(ledger),
    ...criterionRemediations(ledger),
  ].sort(worstFirst);

// ---- the facts ------------------------------------------------------------

const isBlocker = (finding: ConfirmedFinding, policy: DecisionPolicy): boolean =>
  policy.blockingSeverities.includes(finding.severity) || policy.findingTypes[finding.type].gate;

/**
 * Whether enough samples saw an item for it to block. An item a lens
 * confirmed after losing a sample (`lostSample: 'score-only'`) carries fewer
 * hits than `minHits`: it prices like any other, and blocks nothing.
 */
const agreed = (item: { hits: number }, policy: DecisionPolicy): boolean =>
  item.hits >= policy.evidence.minHits;

/**
 * Whether the evaluator bore a finding out, where the policy asks. Under
 * `cited`, a finding that names criteria is held to them: one of them must be
 * a gating criterion the evaluator failed. A finding that names none made no
 * claim the evaluator could check, and stands on its agreement alone — the
 * safety net for a fault the rubric never spelled out. Under `none`, every
 * finding stands on agreement alone, as every pipeline before the field did.
 */
const corroborated = (
  finding: ConfirmedFinding,
  failedGating: ReadonlySet<string>,
  policy: DecisionPolicy,
): boolean =>
  (policy.evidence.corroboration ?? 'none') === 'none' ||
  finding.criterionIds.length === 0 ||
  finding.criterionIds.some((id) => failedGating.has(id));

/** How much of the contract was judged at all; zero when there was nothing to judge. */
const assessedShareOf = (criteria: readonly CriterionEvidence[]): number =>
  criteria.length === 0
    ? 0
    : criteria.filter((evidence) => evidence.result !== 'unassessed').length / criteria.length;

export function buildContext(ledger: EvidenceLedger, policy: DecisionPolicy): GateContext {
  const contradicted = contradictedFindings(ledger, policy);
  const scored = scoreDimensions(ledger, policy, contradicted);
  // A report refuses whether it blocks the lenses or only cuts the artifact —
  // and only on a problem the controller acts on: one that merely informs
  // (a field past the size it was asked for) moves no route, as the header says.
  const validators = ledger.validation.filter(
    (report) =>
      (REFUSING_GATES as readonly string[]).includes(report.gate) &&
      report.problems.some(actionable),
  );
  const assessedShare = assessedShareOf(ledger.criteria);
  const criteria = ledger.criteria.filter(
    (evidence) =>
      policy.criterionKinds[evidence.kind].gate &&
      evidence.result === 'fail' &&
      agreed(evidence, policy),
  );
  const failedGating = new Set(criteria.map((evidence) => evidence.criterionId));
  const findings = ledger.findings.filter(
    (finding) =>
      isBlocker(finding, policy) &&
      agreed(finding, policy) &&
      corroborated(finding, failedGating, policy),
  );
  return {
    ledger,
    policy,
    scored,
    gates: {
      artifactPresent: ledger.artifactPresent,
      validatorsPassed: validators.length === 0,
      evidenceSufficient:
        ledger.criteria.length > 0 && assessedShare >= policy.evidence.minAssessedShare,
      policyAllowed: findings.length === 0 && criteria.length === 0,
    },
    blocking: { validators, findings, criteria },
    assessedShare,
    remediations: selectRemediations(ledger),
  };
}
