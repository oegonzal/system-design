/**
 * The controller. One pure function of the ledger and the policy: the scores
 * are computed once (and traced whether or not a gate fires), the gates are
 * checked in a fixed order, and the first step that decides names the reason.
 * No clock, no randomness, no prose in — same ledger, same decision, always.
 */
import type {
  ConfirmedFinding,
  DecisionFactor,
  DecisionStep,
  DimensionTrace,
  EvidenceLedger,
  Gates,
  QualityControlDecision,
  Remediation,
  Decision,
  Severity,
} from './contracts';
import { compareFindings, compareStrings, severityRank } from './ordering';
import type { DecisionPolicy } from './policy';

const round1 = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** Ordering severities for criterion shortfalls in the remediation list; never priced. */
const SHORTFALL_SEVERITY: Record<'fail' | 'partial', Severity> = {
  fail: 'high',
  partial: 'medium',
};

interface Scored {
  dimensions: DimensionTrace[];
  weightSum: number;
  weightedTotal: number;
  overall: number;
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
function selectRemediations(ledger: EvidenceLedger, policy: DecisionPolicy): Remediation[] {
  void policy;
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

export function decide(ledger: EvidenceLedger, policy: DecisionPolicy): QualityControlDecision {
  const steps: DecisionStep[] = [];
  let settled: { finalDecision: Decision; reason: string } | null = null;
  const record = (
    factor: DecisionFactor,
    outcome: DecisionStep['outcome'],
    detail: string,
  ): void => {
    steps.push({ order: steps.length + 1, factor, outcome, detail });
  };
  const settle = (factor: DecisionFactor, finalDecision: Decision, reason: string): void => {
    settled = { finalDecision, reason };
    record(factor, 'decided', reason);
  };
  const gate = (factor: DecisionFactor, ok: boolean, detail: string, onFail: () => void): void => {
    if (settled) return record(factor, 'skipped', 'not reached');
    if (ok) return record(factor, 'passed', detail);
    onFail();
  };

  // 0. Scores are a total function of the ledger: computed and traced regardless of the gates.
  const scored = scoreDimensions(ledger, policy);
  const assessedCount = scored.dimensions.filter((trace) => trace.score !== null).length;
  record(
    'scores',
    'computed',
    `overall ${scored.overall} over ${assessedCount} assessed dimension(s)`,
  );

  const blockingValidators = ledger.validation.filter(
    (report) => report.gate === 'block' && report.problems.length > 0,
  );
  const assessedShare =
    ledger.criteria.length === 0
      ? 0
      : ledger.criteria.filter((evidence) => evidence.result !== 'unassessed').length /
        ledger.criteria.length;
  const blockingFindings = ledger.findings.filter((finding) => isBlocker(finding, policy));
  const blockingCriteria = ledger.criteria.filter(
    (evidence) => policy.criterionKinds[evidence.kind].gate && evidence.result === 'fail',
  );
  const gates: Gates = {
    artifactPresent: ledger.artifactPresent,
    validatorsPassed: blockingValidators.length === 0,
    evidenceSufficient:
      ledger.criteria.length > 0 && assessedShare >= policy.evidence.minAssessedShare,
    policyAllowed: blockingFindings.length === 0 && blockingCriteria.length === 0,
  };
  const remediations = selectRemediations(ledger, policy);

  // 1. artifact
  gate('artifact', gates.artifactPresent, 'an artifact is present', () =>
    settle('artifact', 'escalate', 'no artifact to judge'),
  );

  // 2. validators
  gate('validators', gates.validatorsPassed, 'every blocking validator passed', () =>
    settle(
      'validators',
      'retry',
      `blocked by validator(s) ${blockingValidators.map((report) => report.validatorId).join(', ')}`,
    ),
  );

  // 3. evidence
  gate(
    'evidence',
    gates.evidenceSufficient,
    `${Math.round(assessedShare * 100)}% of ${ledger.criteria.length} criteria assessed`,
    () =>
      settle(
        'evidence',
        'escalate',
        ledger.criteria.length === 0
          ? 'no criteria to judge against'
          : `only ${Math.round(assessedShare * 100)}% of criteria assessed; unassessed: ${ledger.criteria
              .filter((evidence) => evidence.result === 'unassessed')
              .map((evidence) => evidence.criterionId)
              .join(', ')}`,
      ),
  );

  // 4. policy-allowed
  gate(
    'policy-allowed',
    gates.policyAllowed,
    'no blocking finding or failed gating criterion',
    () => {
      const fixabilities = blockingFindings.map((finding) => finding.fixability);
      const named = [
        ...blockingFindings.map((finding) => finding.key),
        ...blockingCriteria.map((evidence) => evidence.criterionId),
      ].join(', ');
      if (fixabilities.includes('unfixable')) {
        settle('policy-allowed', 'reject', `unfixable blocker: ${named}`);
      } else if (fixabilities.includes('requires_user')) {
        settle('policy-allowed', 'escalate', `a blocker needs a person: ${named}`);
      } else if (
        blockingCriteria.length === 0 &&
        fixabilities.every((f) => f === 'requires_retry')
      ) {
        settle('policy-allowed', 'retry', `blockers require a fresh attempt: ${named}`);
      } else {
        settle('policy-allowed', 'revise', `blockers to fix: ${named}`);
      }
    },
  );

  // 5. accept threshold
  gate(
    'accept-threshold',
    scored.overall < policy.thresholds.acceptAt,
    `overall ${scored.overall} below ${policy.thresholds.acceptAt}`,
    () =>
      settle(
        'accept-threshold',
        'accept',
        `overall ${scored.overall} ≥ ${policy.thresholds.acceptAt}`,
      ),
  );

  // 6. reject floor: below it, editing is not worth it — regenerate.
  gate(
    'reject-floor',
    scored.overall >= policy.thresholds.rejectBelow,
    `overall ${scored.overall} at or above the floor ${policy.thresholds.rejectBelow}`,
    () =>
      settle(
        'reject-floor',
        'retry',
        `overall ${scored.overall} below the floor ${policy.thresholds.rejectBelow}`,
      ),
  );

  // 7. route by what the producer can act on
  if (settled) {
    record('route', 'skipped', 'not reached');
  } else if (remediations.length === 0) {
    settle('route', 'escalate', 'below the accept threshold with nothing the producer can act on');
  } else if (remediations.every((remediation) => remediation.action === 'retry')) {
    settle(
      'route',
      'retry',
      `${remediations.length} remediation(s), all requiring a fresh attempt`,
    );
  } else {
    settle('route', 'revise', `${remediations.length} remediation(s) to apply`);
  }

  const outcome = settled as unknown as { finalDecision: Decision; reason: string };
  return {
    finalDecision: outcome.finalDecision,
    gates,
    scores: {
      dimensions: Object.fromEntries(
        scored.dimensions.map((trace) => [trace.dimension, trace.score]),
      ),
      overall: scored.overall,
    },
    selectedRemediations: remediations,
    reason: outcome.reason,
    trace: {
      steps,
      dimensions: scored.dimensions,
      weightSum: round1(scored.weightSum * 1000) / 1000,
      weightedTotal: round1(scored.weightedTotal),
    },
  };
}
