import type {
  ConfirmedFinding,
  CriterionEvidence,
  SuccessCriterion,
  ValidationReport,
} from './evidence';
import type { QualityRunDto } from './runs';
import { REFUSING_GATES, type Decision } from './vocab';

/**
 * Recorded runs as fakes hand them out, in the wire shape the loop would have
 * recorded, so every reader — the browser session's engine, the read-back
 * routers, a spec — reads a fixture through the same contracts code as a real
 * run. No vitest import: shared by pure specs and scripted end-to-end runs.
 */
export interface FakeRunOptions {
  runId?: string;
  decision?: Decision;
  findings?: ConfirmedFinding[];
  validation?: ValidationReport[];
  policyAllowed?: boolean;
  status?: QualityRunDto['status'];
  /** Criteria the fake evaluator settled pass, by id; `evidence` replaces this when given. */
  passed?: readonly string[];
  /** The evaluator's rows as recorded, when a spec needs more than passes. */
  evidence?: CriterionEvidence[];
  /** Whether the request carried a rubric; by default, whether `criteria` has one. */
  criteriaProvided?: boolean;
  overall?: number;
  reason?: string;
  /** Whether the lenses assessed enough of the rubric; false for a run the evidence gate found under-judged. */
  evidenceSufficient?: boolean;
}

let sequence = 0;

/** A confirmed finding at the given locations, as a judge would have recorded it. */
export function finding(
  type: string,
  locationRefs: string[],
  rationale = `${type} seen`,
): ConfirmedFinding {
  return {
    key: `${type}|${[...locationRefs].sort().join(',')}`,
    type,
    severity: 'high',
    confidence: 'high',
    fixability: 'fixable_local',
    locationRefs,
    criterionIds: [],
    hits: 2,
    lenses: ['critic.fake'],
    rationale,
    reconciledTo: null,
  };
}

/** One finished run with one judged iteration holding the artifact. */
export function fakeRun(
  pipeline: string,
  artifact: unknown,
  options: FakeRunOptions = {},
  criteria: readonly SuccessCriterion[] = [],
): QualityRunDto {
  const runId = options.runId ?? `fake-${pipeline}-${++sequence}`;
  const decision = options.decision ?? 'accept';
  const validation = options.validation ?? [];
  const refusing = validation.filter(
    (report) =>
      (REFUSING_GATES as readonly string[]).includes(report.gate) && report.problems.length > 0,
  );
  const blocked = refusing.length > 0;
  // What the engine would have recorded: every refusing report, and — when the
  // policy gate is closed — every finding the fixture carries.
  const policyAllowed = options.policyAllowed ?? true;
  const blocking = {
    validators: refusing.map((report) => report.validatorId),
    findings: policyAllowed ? [] : (options.findings ?? []).map((finding) => finding.key),
    criteria: [],
  };
  const at = '2026-10-03T10:00:00.000Z';
  return {
    runId,
    pipeline,
    status: options.status ?? 'complete',
    startedAt: at,
    finishedAt: at,
    heartbeatAt: at,
    llm: { model: 'fake-model' },
    request: {
      goal: 'fake goal',
      outputProvided: false,
      criteriaProvided: options.criteriaProvided ?? criteria.length > 0,
      adoptedFrom: null,
      maxIterations: 1,
    },
    parentRunId: null,
    openedBy: null,
    recall: null,
    trace: {
      pipeline: { id: pipeline, version: 'fake' },
      contract: { goal: 'fake goal', criteria: [...criteria] },
      iterations: [
        {
          iteration: 1,
          mode: 'initial',
          artifact,
          locations: [],
          rendered: null,
          validation,
          critics: [],
          evaluators: [],
          ledger: {
            artifactPresent: artifact !== null,
            validation,
            criteria:
              options.evidence ??
              (options.passed ?? []).map((criterionId) => ({
                criterionId,
                kind:
                  FAKE_RUBRIC.find((criterion) => criterion.id === criterionId)?.kind ?? 'progress',
                result: 'pass' as const,
                hits: 1,
                confidence: 'high' as const,
                locationRefs: [],
              })),
            findings: options.findings ?? [],
            discarded: [],
            diagnostics: [],
          },
          decision: {
            finalDecision: decision,
            gates: {
              artifactPresent: artifact !== null,
              validatorsPassed: !blocked,
              evidenceSufficient: options.evidenceSufficient ?? true,
              policyAllowed,
            },
            blocking,
            scores: {
              dimensions: {},
              overall: options.overall ?? (decision === 'accept' ? 85 : 40),
            },
            selectedRemediations: [],
            reason: options.reason ?? 'fake',
            trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 0 },
          },
          remediations: [],
          durationMs: 0,
        },
      ],
      bestIteration: 1,
      finalDecision: decision,
      stopReason: decision === 'accept' ? 'accepted' : 'escalated',
      lessons: [],
    },
    exchanges: [],
    error: null,
  };
}

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

/** A finished run of the named pipeline with one iteration, judged as described. */
export function judgedRun(pipeline: string, shape: RunShape): QualityRunDto {
  const finalDecision = shape.finalDecision ?? 'accept';
  return fakeRun(
    pipeline,
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

/** The rubric the fakes judge against: three criteria of two kinds, enough for a routing decision to turn on. */
export const FAKE_RUBRIC: SuccessCriterion[] = [
  { id: 'c1', kind: 'progress', statement: 'The search is run before any listing is opened.' },
  { id: 'c2', kind: 'safety', statement: 'No hidden field is filled.' },
  { id: 'c3', kind: 'progress', statement: 'Every page of the form is answered.' },
];
