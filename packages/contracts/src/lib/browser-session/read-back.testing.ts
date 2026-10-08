import {
  type ConfirmedFinding,
  type CriterionEvidence,
  type SuccessCriterion,
  type ValidationReport,
} from '../quality-loop/evidence';
import { fakeRun } from '../quality-loop/run-fixtures';
import { type QualityRunDto } from '../quality-loop/runs';
import { type Decision } from '../quality-loop/vocab';

/** How a spec describes the one judged iteration of a run; every other field is the quiet default. */
export interface RunShape {
  artifact: unknown;
  finalDecision?: Decision;
  policyAllowed?: boolean;
  findings?: Partial<ConfirmedFinding>[];
  validation?: ValidationReport[];
  criteria?: Partial<CriterionEvidence>[];
  contract?: SuccessCriterion[];
  evidenceSufficient?: boolean;
}

/** A finished run with one iteration, judged as described. */
export function judgedRun(shape: RunShape): QualityRunDto {
  const finalDecision = shape.finalDecision ?? 'accept';
  return fakeRun(
    'browser-step',
    shape.artifact,
    {
      runId: 'run-1',
      decision: finalDecision,
      policyAllowed: shape.policyAllowed,
      validation: shape.validation,
      findings: (shape.findings ?? []).map((f, i) => ({
        key: f.key ?? `${f.type ?? 'defect'}|${(f.locationRefs ?? []).join(',')}`,
        type: f.type ?? 'defect',
        severity: f.severity ?? 'medium',
        confidence: f.confidence ?? 'high',
        fixability: f.fixability ?? 'fixable_local',
        locationRefs: f.locationRefs ?? [],
        criterionIds: f.criterionIds ?? [],
        hits: 1,
        lenses: [`critic.${i}`],
        rationale: f.rationale ?? null,
        reconciledTo: null,
      })),
      evidence: (shape.criteria ?? []).map((c) => ({
        criterionId: c.criterionId ?? 'c1',
        kind: c.kind ?? 'progress',
        result: c.result ?? 'pass',
        hits: 1,
        confidence: 'high',
        locationRefs: c.locationRefs ?? [],
      })),
      criteriaProvided: true,
      overall: 80,
      reason: `decided ${finalDecision}`,
      evidenceSufficient: shape.evidenceSufficient ?? true,
    },
    shape.contract ?? [],
  );
}
