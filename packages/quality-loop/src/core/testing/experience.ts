/**
 * A finished run the specs of everything that reads one can share: a
 * two-iteration system-design run with one finding remediated and resolved,
 * one that persisted unremediated, and one criterion that improved. Both
 * digests reduce a run through `core/outputs/experience-record`, so the sample
 * they reduce lives beside it rather than in either pipeline. Pure helpers only
 * — no vitest imports — so the file compiles under the app tsconfig.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  IterationTrace,
  QualityControlDecision,
  QualityRunDto,
  RawFinding,
  Remediation,
  RunTrace,
} from '@sysdesign/contracts';

export const RESOLVED_KEY = 'unhandled_failure|flow.1';
export const PERSISTED_KEY = 'contradiction|component.1';

const decision = (
  finalDecision: QualityControlDecision['finalDecision'],
  overall: number,
  dimensions: Record<string, number | null>,
  selectedRemediations: Remediation[],
  reason: string,
): QualityControlDecision => ({
  finalDecision,
  gates: {
    artifactPresent: true,
    validatorsPassed: true,
    evidenceSufficient: true,
    policyAllowed: true,
  },
  blocking: { validators: [], findings: [], criteria: [] },
  scores: { dimensions, overall },
  selectedRemediations,
  reason,
  trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: overall },
});

const confirmed = (overrides: Partial<ConfirmedFinding>): ConfirmedFinding => ({
  key: RESOLVED_KEY,
  type: 'unhandled_failure',
  severity: 'high',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs: ['flow.1'],
  criterionIds: ['c1'],
  hits: 2,
  lenses: ['critic.soundness'],
  rationale: null,
  reconciledTo: null,
  ...overrides,
});

const raw = (overrides: Partial<RawFinding>): RawFinding => ({
  type: 'unhandled_failure',
  severity: 'high',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs: ['flow.1'],
  criterionIds: ['c1'],
  rationale: 'the read path has no story for a POS outage',
  ...overrides,
});

const evidence = (criterionId: string, kind: string, result: CriterionEvidence['result']) => ({
  criterionId,
  kind,
  result,
  hits: 2,
  confidence: 'high' as const,
  locationRefs: ['flow.1'],
});

const iteration = (
  overrides: Partial<IterationTrace> & Pick<IterationTrace, 'iteration' | 'mode' | 'decision'>,
): IterationTrace => ({
  artifact: { summary: 'a history service' },
  locations: [
    { id: 'summary', label: 'Summary' },
    { id: 'component.1', label: 'History API' },
    { id: 'flow.1', label: 'view history' },
  ],
  rendered:
    '[summary] A read-optimised history service.\n\n## Components\n[component.1] History API — serves the list\n\n## Flows\n[flow.1] view history: History API → Order store',
  validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
  critics: [],
  evaluators: [],
  ledger: {
    artifactPresent: true,
    validation: [],
    criteria: [],
    findings: [],
    discarded: [],
    diagnostics: [],
  },
  remediations: [],
  durationMs: 10,
  ...overrides,
});

const persisted = confirmed({
  key: PERSISTED_KEY,
  type: 'contradiction',
  severity: 'medium',
  fixability: 'requires_user',
  locationRefs: ['component.1'],
  criterionIds: [],
  lenses: ['critic.soundness', 'critic.requirements'],
});

export const sampleIterations = (): IterationTrace[] => [
  iteration({
    iteration: 1,
    mode: 'initial',
    critics: [
      {
        report: {
          criticId: 'critic.soundness',
          sample: 1,
          findings: [
            raw({}),
            raw({
              type: 'contradiction',
              severity: 'medium',
              fixability: 'requires_user',
              locationRefs: ['component.1'],
              criterionIds: [],
              rationale: 'the API is stateless in one place and caches in another',
            }),
          ],
        },
        diagnostic: null,
      },
    ],
    ledger: {
      artifactPresent: true,
      validation: [],
      criteria: [evidence('c1', 'functional', 'partial'), evidence('c2', 'constraint', 'pass')],
      findings: [confirmed({}), persisted],
      discarded: [],
      diagnostics: [],
    },
    decision: decision(
      'revise',
      57,
      { completeness: 50, soundness: 40, compliance: 100, quality_attributes: null },
      [
        {
          subject: { finding: RESOLVED_KEY },
          action: 'revise',
          severity: 'high',
          targetRefs: ['flow.1'],
        },
        {
          subject: { criterion: 'c1' },
          action: 'revise',
          severity: 'medium',
          targetRefs: ['flow.1'],
        },
      ],
      'below the accept threshold',
    ),
  }),
  iteration({
    iteration: 2,
    mode: 'revise',
    ledger: {
      artifactPresent: true,
      validation: [],
      criteria: [evidence('c1', 'functional', 'pass'), evidence('c2', 'constraint', 'pass')],
      findings: [{ ...persisted, reconciledTo: null }],
      discarded: [],
      diagnostics: [],
    },
    decision: decision(
      'accept',
      86,
      { completeness: 100, soundness: 76, compliance: 100, quality_attributes: null },
      [],
      'at or above the accept threshold',
    ),
  }),
];

export const sampleRun = (overrides: Partial<QualityRunDto> = {}): QualityRunDto => {
  const iterations = sampleIterations();
  return {
    runId: '2026-09-06T22-43-36-266-a874eb-quality',
    pipeline: 'system-design',
    status: 'complete',
    startedAt: '2026-09-06T22:43:36.266Z',
    finishedAt: '2026-09-06T22:49:00.000Z',
    heartbeatAt: '2026-09-06T22:49:00.000Z',
    llm: { model: 'claude-code/subscription' },
    request: {
      goal: '# Prompt — Serve an order history\n\nList past orders.',
      outputProvided: false,
      criteriaProvided: false,

      adoptedFrom: null,
      maxIterations: 3,
    },
    parentRunId: null,
    openedBy: null,
    recall: null,
    trace: {
      pipeline: { id: 'system-design', version: '1.0.0' },
      contract: {
        goal: '# Prompt — Serve an order history\n\nList past orders.',
        criteria: [
          { id: 'c1', kind: 'functional', statement: 'List orders newest first.' },
          {
            id: 'c2',
            kind: 'constraint',
            statement: 'The POS is polled, never called per request.',
          },
        ],
      },
      iterations,
      bestIteration: 2,
      finalDecision: 'accept',
      stopReason: 'accepted',
      lessons: [
        {
          kind: 'resolved',
          subject: RESOLVED_KEY,
          iterations: [1, 2],
          detail: 'the finding did not recur',
        },
        {
          kind: 'persisted',
          subject: PERSISTED_KEY,
          iterations: [1, 2],
          detail: 'the finding survived the revision',
        },
        { kind: 'improved', subject: 'c1', iterations: [1, 2], detail: 'partial → pass' },
      ],
    },
    exchanges: [],
    error: null,
    ...overrides,
  };
};

/** The sample run's trace, for a spec that reshapes one: the sample carries a trace by construction. */
export const sampleTrace = (overrides: Partial<QualityRunDto> = {}): RunTrace => {
  const { trace } = sampleRun(overrides);
  if (trace === null) throw new Error('the sample run carries a trace');
  return trace;
};
