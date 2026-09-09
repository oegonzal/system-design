/**
 * What every gate reads: the ledger priced once. Scores are a total function
 * of the ledger and are traced whether or not a gate fires; the four facts
 * are the engine's, computed the same way under every controller; the
 * remediations are everything the producer could act on, worst first. A gate
 * observes this context and gives a verdict — it never edits it.
 */
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

import { compareFindings, compareStrings, severityRank } from '../ordering';

export const round1 = (value: number): number => Math.round(value * 10) / 10;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

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

function scoreDimensions(ledger: EvidenceLedger, policy: DecisionPolicy): Scored {
  const chargeable = ledger.findings.filter((finding) => finding.reconciledTo === null);
  const { bySeverity, decay, maxPerDimension } = policy.penalties;

  const dimensions = Object.keys(policy.dimensionWeights).map((dimension): DimensionTrace => {
    const criteria = ledger.criteria
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
        value:
          evidence.result === 'unassessed' || evidence.result === 'not_applicable'
            ? 0
            : policy.resultValues[evidence.result],
      }));
    const totalWeight = sum(criteria.map((criterion) => criterion.weight));
    const earned = sum(criteria.map((criterion) => criterion.weight * (criterion.value ?? 0)));

    const findings = chargeable
      .filter((finding) => policy.findingTypes[finding.type].dimension === dimension)
      .sort(compareFindings);
    const base =
      criteria.length > 0 ? (100 * earned) / totalWeight : findings.length > 0 ? 100 : null;

    const penalties = findings.map((finding, position) => {
      const listPoints =
        bySeverity[finding.severity] * policy.confidenceWeights[finding.confidence];
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
    const penaltyTotal = rawTotal * clampScale;
    const score = base === null ? null : round1(clamp(base - penaltyTotal, 0, 100));

    return {
      dimension,
      weight: score === null ? null : policy.dimensionWeights[dimension],
      criteria,
      base: base === null ? null : round1(base),
      penalties,
      penaltyTotal: round1(penaltyTotal),
      clampScale: round1(clampScale * 1000) / 1000,
      score,
    };
  });

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

/** Everything the producer could act on, worst first. Pricing and fixing are different questions. */
function selectRemediations(ledger: EvidenceLedger): Remediation[] {
  const fromFindings = ledger.findings
    .filter(
      (finding) =>
        finding.fixability === 'fixable_local' || finding.fixability === 'requires_retry',
    )
    .map((finding): Remediation => ({
      subject: { finding: finding.key },
      action: finding.fixability === 'fixable_local' ? 'revise' : 'retry',
      severity: finding.severity,
      targetRefs: finding.locationRefs,
    }));
  const fromCriteria = ledger.criteria
    .filter((evidence) => evidence.result === 'fail' || evidence.result === 'partial')
    .map((evidence): Remediation => ({
      subject: { criterion: evidence.criterionId },
      action: 'revise',
      severity: SHORTFALL_SEVERITY[evidence.result as 'fail' | 'partial'],
      targetRefs: evidence.locationRefs,
    }));
  const fromValidators = ledger.validation
    .filter((report) => report.problems.length > 0)
    .map((report): Remediation => ({
      subject: { validator: report.validatorId },
      action: report.gate === 'block' ? 'retry' : 'revise',
      severity: [...report.problems].sort(
        (a, b) => severityRank(a.severity) - severityRank(b.severity),
      )[0].severity,
      targetRefs: [...new Set(report.problems.flatMap((problem) => problem.locationRefs))].sort(
        compareStrings,
      ),
    }));
  const subjectKey = (remediation: Remediation): string => Object.values(remediation.subject)[0];
  return [...fromValidators, ...fromFindings, ...fromCriteria].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      compareStrings(subjectKey(a), subjectKey(b)),
  );
}

const isBlocker = (finding: ConfirmedFinding, policy: DecisionPolicy): boolean =>
  policy.blockingSeverities.includes(finding.severity) || policy.findingTypes[finding.type].gate;

export function buildContext(ledger: EvidenceLedger, policy: DecisionPolicy): GateContext {
  const scored = scoreDimensions(ledger, policy);
  const validators = ledger.validation.filter(
    (report) => report.gate === 'block' && report.problems.length > 0,
  );
  const assessedShare =
    ledger.criteria.length === 0
      ? 0
      : ledger.criteria.filter((evidence) => evidence.result !== 'unassessed').length /
        ledger.criteria.length;
  const findings = ledger.findings.filter((finding) => isBlocker(finding, policy));
  const criteria = ledger.criteria.filter(
    (evidence) => policy.criterionKinds[evidence.kind].gate && evidence.result === 'fail',
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
