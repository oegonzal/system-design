/**
 * Builders the experience-digest specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. `sampleRun` is a
 * two-iteration system-design run: one finding remediated and resolved, one
 * that persisted unremediated, one criterion that improved.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  IterationTrace,
  QualityControlDecision,
  QualityRunDto,
  RawFinding,
  Remediation,
} from '@sysdesign/contracts';

import { fill } from '../../core/testing';
import {
  ALIAS_MAX,
  KEY_MAX,
  LENS_MAX,
  MAX_CRITERIA_ITEMS,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_LENSES,
  MAX_FINDING_REFS,
  MAX_FINDINGS,
  MAX_MEMORIES,
  RATIONALE_MAX,
  REF_MAX,
  STATEMENT_MAX,
  TRANSITION_DETAIL_MAX,
  type ExperienceRecord,
  type RecordedCriterion,
  type RecordedFinding,
} from './input';
import type { ExperienceDigest } from './output';

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
    llm: { enabled: true, model: 'claude-code/subscription', reason: null },
    request: {
      goal: '# Prompt — Serve an order history\n\nList past orders.',
      outputProvided: false,
      criteriaProvided: false,

      adoptedFrom: null,
      maxIterations: 3,
    },
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

export const sampleDigest = (overrides: Partial<ExperienceDigest> = {}): ExperienceDigest => ({
  summary:
    'The loop accepted once the read path handled a POS outage; a contradiction it could not fix stayed.',
  memories: [
    {
      evidence: ['f1', 'r1'],
      insight:
        'Give every read path that depends on an upstream a story for that upstream being down.',
      appliesWhen: 'a functional requirement is served from data an unreliable system provides',
    },
  ],
  unused: ['f2', 'r2'],
  ...overrides,
});

const maximalFinding = (position: number): RecordedFinding => ({
  alias: `f${position + 1}`,
  key: fill(KEY_MAX),
  type: fill(60),
  severity: 'critical',
  confidence: 'medium',
  fixability: 'fixable_local',
  locationRefs: Array.from({ length: MAX_FINDING_REFS }, () => fill(REF_MAX)),
  criteria: Array.from({ length: MAX_FINDING_CRITERIA }, () => fill(ALIAS_MAX)),
  lenses: Array.from({ length: MAX_FINDING_LENSES }, () => fill(LENS_MAX)),
  iterations: Array.from({ length: 10 }, (_, index) => index + 1),
  rationale: fill(RATIONALE_MAX),
  remediated: true,
  reconciledTo: fill(ALIAS_MAX),
  transitions: Array.from({ length: 10 }, () => ({
    kind: 'persisted' as const,
    iterations: [1, 2],
    detail: fill(TRANSITION_DETAIL_MAX),
  })),
});

const maximalCriterion = (position: number): RecordedCriterion => ({
  alias: `r${position + 1}`,
  id: fill(20),
  kind: fill(60),
  statement: fill(STATEMENT_MAX),
  results: Array.from({ length: 10 }, (_, index) => ({
    iteration: index + 1,
    result: 'partial' as const,
  })),
  transitions: Array.from({ length: 10 }, () => ({
    kind: 'improved' as const,
    iterations: [1, 2],
    detail: fill(TRANSITION_DETAIL_MAX),
  })),
});

/** Every field at its cap: the render of this must stay under the goal budget. */
export const maximalRecord = (): ExperienceRecord => ({
  runId: fill(80),
  pipeline: fill(120),
  finalDecision: 'escalate',
  stopReason: 'max-iterations',
  bestIteration: 10,
  prompt: fill(12_000),
  artifact: fill(16_000),
  iterations: Array.from({ length: 10 }, (_, index) => ({
    iteration: index + 1,
    mode: 'revise' as const,
    decision: 'revise' as const,
    reason: fill(200),
    overall: 55.5,
    overallDelta: -10.5,
    dimensions: Object.fromEntries(
      Array.from({ length: 8 }, (_, d) => [fill(40, String(d)), 55.5]),
    ),
    dimensionDeltas: Object.fromEntries(
      Array.from({ length: 8 }, (_, d) => [fill(40, String(d)), -10.5]),
    ),
  })),
  criteria: Array.from({ length: MAX_CRITERIA_ITEMS }, (_, index) => maximalCriterion(index)),
  findings: Array.from({ length: MAX_FINDINGS }, (_, index) => maximalFinding(index)),
  omitted: { findings: 99, criteria: 99 },
  rules: Array.from({ length: 8 }, () => fill(300)),
  maxMemories: MAX_MEMORIES,
});
