import {
  SEVERITIES,
  type AxisFactorLevel,
  type ConfirmedFinding,
  type CriterionEvidence,
  type EvidenceResult,
  type Gates,
  type QualityControlDecision,
  type Remediation,
  type RemediationNote,
  type Severity,
  type SuccessCriterion,
} from '@sysdesign/contracts';

/** The joins the results view needs, as pure functions over the wire contract. */

export interface CriterionRow {
  id: string;
  kind: string;
  statement: string;
  result: EvidenceResult;
  hits: number;
  confidence: AxisFactorLevel | null;
  locationRefs: string[];
}

/** contract.criteria ⋈ ledger.criteria by id, in contract order; a criterion no lens judged reads `unassessed`. */
export function criteriaRows(
  criteria: readonly SuccessCriterion[],
  evidence: readonly CriterionEvidence[],
): CriterionRow[] {
  const byId = new Map(evidence.map((entry) => [entry.criterionId, entry]));
  return criteria.map(({ id, kind, statement }) => {
    const entry = byId.get(id);
    return {
      id,
      kind,
      statement,
      result: entry?.result ?? 'unassessed',
      hits: entry?.hits ?? 0,
      confidence: entry?.confidence ?? null,
      locationRefs: entry?.locationRefs ?? [],
    };
  });
}

export interface FindingRow extends ConfirmedFinding {
  /** The lens's own words, when the policy selected this finding for remediation. */
  note: string | null;
  action: Remediation['action'] | null;
}

export interface FindingGroup {
  severity: Severity;
  findings: FindingRow[];
}

/** ledger.findings ⋈ remediations by the finding key, grouped worst severity first; empty groups omitted. */
export function findingGroups(
  findings: readonly ConfirmedFinding[],
  remediations: readonly RemediationNote[],
): FindingGroup[] {
  const byKey = new Map<string, RemediationNote>();
  for (const remediation of remediations) {
    if ('finding' in remediation.subject && !byKey.has(remediation.subject.finding)) {
      byKey.set(remediation.subject.finding, remediation);
    }
  }
  const rows = findings.map((finding): FindingRow => {
    const remediation = byKey.get(finding.key);
    return { ...finding, note: remediation?.note ?? null, action: remediation?.action ?? null };
  });
  return SEVERITIES.map((severity) => ({
    severity,
    findings: rows.filter((row) => row.severity === severity),
  })).filter((group) => group.findings.length > 0);
}

export interface DimensionRow {
  dimension: string;
  score: number | null;
  weight: number | null;
  penaltyTotal: number;
}

/** One row per policy dimension, from the decision's own trace — the figures it was computed with. */
export const dimensionRows = (decision: QualityControlDecision): DimensionRow[] =>
  decision.trace.dimensions.map(({ dimension, score, weight, penaltyTotal }) => ({
    dimension,
    score,
    weight,
    penaltyTotal,
  }));

export const GATE_ORDER = [
  'artifactPresent',
  'validatorsPassed',
  'evidenceSufficient',
  'policyAllowed',
] as const satisfies readonly (keyof Gates)[];

export const subjectLabel = (subject: Remediation['subject']): string =>
  'finding' in subject
    ? `finding ${subject.finding}`
    : 'criterion' in subject
      ? `criterion ${subject.criterion}`
      : 'validator' in subject
        ? `validator ${subject.validator}`
        : `schema ${subject.schema}`;
