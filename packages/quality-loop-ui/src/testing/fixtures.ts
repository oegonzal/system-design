import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';

import { CRITERIA, makeIteration, RENDERED } from './iteration';
import { PROMPT_MARKDOWN } from './library';

export * from './iteration';
export * from './library';
export * from './orchestration';

/** Whole runs as `GET /runs/:id` reports them: the default revise, the model-off escalation, a two-iteration accept. */

export const makeTrace = (overrides: Partial<RunTrace> = {}): RunTrace => ({
  pipeline: { id: 'system-design', version: '1.0.0' },
  contract: { goal: PROMPT_MARKDOWN, criteria: CRITERIA },
  iterations: [makeIteration()],
  bestIteration: 1,
  finalDecision: 'revise',
  stopReason: 'max-iterations',
  lessons: [],
  ...overrides,
});

export const makeRun = (overrides: Partial<QualityRunDto> = {}): QualityRunDto => ({
  runId: '2026-09-06T00-00-00-000-abc123-quality',
  pipeline: 'system-design',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:05:17.000Z',
  heartbeatAt: '2026-09-06T00:05:17.000Z',
  llm: { model: 'test-model' },
  request: {
    goal: PROMPT_MARKDOWN,
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 1,
  },
  parentRunId: null,
  openedBy: null,
  recall: null,
  trace: makeTrace(),
  exchanges: [
    {
      scope: 'criteria',
      ordinal: 1,
      outcome: 'ok',
      durationMs: 8_000,
      startedAt: '2026-09-06T00:00:00.000Z',
    },
    {
      scope: 'producer',
      ordinal: 1,
      outcome: 'ok',
      durationMs: 122_000,
      startedAt: '2026-09-06T00:00:08.000Z',
    },
    {
      scope: 'critic.requirements.s1',
      ordinal: 1,
      outcome: 'ok',
      durationMs: 70_000,
      startedAt: '2026-09-06T00:02:10.000Z',
    },
    {
      scope: 'evaluator.requirements.s1',
      ordinal: 1,
      outcome: 'ok',
      durationMs: 15_000,
      startedAt: '2026-09-06T00:03:20.000Z',
    },
  ],
  error: null,
  ...overrides,
});

/** Every model call failed: nothing is derived or produced, the controller escalates honestly. */
export const makeEscalatedRun = (): QualityRunDto =>
  makeRun({
    exchanges: [],
    finishedAt: '2026-09-06T00:00:00.400Z',
    trace: makeTrace({
      contract: { goal: PROMPT_MARKDOWN, criteria: [] },
      finalDecision: 'escalate',
      stopReason: 'escalated',
      iterations: [
        makeIteration({
          artifact: null,
          locations: [],
          rendered: null,
          validation: [],
          critics: [],
          evaluators: [],
          ledger: {
            artifactPresent: false,
            validation: [],
            criteria: [],
            findings: [],
            discarded: [],
            diagnostics: [
              { stage: 'criteria', sample: null, reason: 'llm-failed', detail: null },
              { stage: 'producer', sample: null, reason: 'llm-failed', detail: null },
              { stage: 'lenses', sample: null, reason: 'not-applicable', detail: 'no artifact' },
            ],
          },
          decision: {
            finalDecision: 'escalate',
            gates: {
              artifactPresent: false,
              validatorsPassed: true,
              evidenceSufficient: false,
              policyAllowed: true,
            },
            blocking: { validators: [], findings: [], criteria: [] },
            scores: { dimensions: { completeness: null, soundness: null }, overall: 0 },
            selectedRemediations: [],
            reason: 'no artifact to judge',
            trace: {
              steps: [
                {
                  order: 1,
                  factor: 'scores',
                  outcome: 'computed',
                  detail: 'no dimension assessed',
                },
                {
                  order: 2,
                  factor: 'artifact',
                  outcome: 'decided',
                  detail: 'no artifact: escalate',
                },
                { order: 3, factor: 'validators', outcome: 'skipped', detail: '' },
                { order: 4, factor: 'evidence', outcome: 'skipped', detail: '' },
                { order: 5, factor: 'policy-allowed', outcome: 'skipped', detail: '' },
                { order: 6, factor: 'accept-threshold', outcome: 'skipped', detail: '' },
                { order: 7, factor: 'reject-floor', outcome: 'skipped', detail: '' },
                { order: 8, factor: 'route', outcome: 'skipped', detail: '' },
              ],
              dimensions: [
                {
                  dimension: 'completeness',
                  weight: null,
                  criteria: [],
                  base: null,
                  penalties: [],
                  penaltyTotal: 0,
                  clampScale: 1,
                  score: null,
                },
                {
                  dimension: 'soundness',
                  weight: null,
                  criteria: [],
                  base: null,
                  penalties: [],
                  penaltyTotal: 0,
                  clampScale: 1,
                  score: null,
                },
              ],
              weightSum: 0,
              weightedTotal: 0,
            },
          },
          remediations: [],
          durationMs: 3,
        }),
      ],
    }),
  });

/** Two iterations: the revise above, then an accepted revision, with the lessons the loop drew. */
export const makeTwoIterationRun = (): QualityRunDto => {
  const first = makeIteration();
  const second = makeIteration({
    iteration: 2,
    mode: 'revise',
    rendered: `${RENDERED}\n[component.3] Read cache — keeps the history page under 300 ms`,
    ledger: {
      ...first.ledger,
      criteria: first.ledger.criteria.map((entry) =>
        entry.criterionId === 'c2'
          ? { ...entry, result: 'pass' as const, confidence: 'high' as const }
          : entry,
      ),
      findings: [],
    },
    decision: {
      ...first.decision,
      finalDecision: 'accept',
      scores: { dimensions: { completeness: 100, soundness: 100 }, overall: 100 },
      selectedRemediations: [],
      reason: 'overall 100 reaches acceptAt 80; accept',
      trace: {
        ...first.decision.trace,
        steps: first.decision.trace.steps.map((step) =>
          step.factor === 'accept-threshold'
            ? { ...step, outcome: 'decided' as const, detail: '100 ≥ 80: accept' }
            : step.order > 6
              ? { ...step, outcome: 'skipped' as const, detail: '' }
              : step,
        ),
        weightedTotal: 100,
      },
    },
    remediations: [],
    durationMs: 298_000,
  });
  return makeRun({
    finishedAt: '2026-09-06T00:10:30.000Z',
    request: {
      goal: PROMPT_MARKDOWN,
      outputProvided: false,
      criteriaProvided: false,

      adoptedFrom: null,
      maxIterations: 3,
    },
    trace: makeTrace({
      iterations: [first, second],
      bestIteration: 2,
      finalDecision: 'accept',
      stopReason: 'accepted',
      lessons: [
        {
          kind: 'resolved',
          subject: 'unsupported_claim|summary',
          iterations: [1, 2],
          detail: 'gone after the revision',
        },
        { kind: 'improved', subject: 'c2', iterations: [1, 2], detail: 'fail → pass' },
      ],
    }),
  });
};
