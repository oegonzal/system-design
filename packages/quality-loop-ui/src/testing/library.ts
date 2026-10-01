import type {
  PipelineSummary,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunSummaryDto,
} from '@sysdesign/contracts';

/** What the service's library and pipeline registry answer, shaped exactly like the wire. */

export const PROMPT_ENTRIES: PromptLibraryEntryDto[] = [
  { id: 'notification-fanout', title: 'Fan out account notifications' },
  { id: 'order-history', title: 'Unify online and in-store orders behind one history' },
];

export const PROMPT_MARKDOWN = [
  '# Unify online and in-store orders behind one history',
  '',
  '## Scenario',
  '',
  'A retail brand sells online and in stores; shoppers expect one Order History list.',
  '',
].join('\n');

export const makePromptDocument = (): PromptLibraryDocumentDto => ({
  id: 'order-history',
  title: 'Unify online and in-store orders behind one history',
  markdown: PROMPT_MARKDOWN,
});

export const makePipeline = (overrides: Partial<PipelineSummary> = {}): PipelineSummary => ({
  id: 'system-design',
  version: '1.0.0',
  description: 'Grade a system design answer against a markdown prompt.',
  goalSource: 'brief',
  task: {
    criterionKinds: {
      functional: 'A capability the prompt asks for.',
      scale: 'A stated scale or performance target.',
    },
    findingTypes: {
      missing_requirement: 'A stated requirement the design does not address.',
      unsupported_claim: 'A claim the design makes without showing how.',
    },
    maxCriteria: 20,
  },
  producer: { consumes: ['criteria'] },
  controller: {
    id: 'standard',
    steps: [
      { factor: 'artifact' },
      { factor: 'validators' },
      { factor: 'evidence' },
      { factor: 'policy-allowed' },
      { factor: 'accept-threshold' },
      { factor: 'reject-floor' },
      { factor: 'route' },
    ],
  },
  validators: [{ id: 'schema', gate: 'block' }],
  critics: [{ id: 'critic.requirements', samples: 1, maxItems: 12, maxTokens: 4000, consumes: [] }],
  evaluators: [
    {
      id: 'evaluator.requirements',
      samples: 1,
      maxItems: 20,
      maxTokens: 4000,
      criterionKinds: ['functional', 'scale'],
      consumes: [],
    },
  ],
  policy: {
    version: '1',
    dimensionWeights: { completeness: 0.6, soundness: 0.4 },
    criterionKinds: {
      functional: { dimension: 'completeness', weight: 1, gate: false },
      scale: { dimension: 'completeness', weight: 1, gate: false },
    },
    findingTypes: {
      missing_requirement: { dimension: 'completeness', gate: false },
      unsupported_claim: { dimension: 'soundness', gate: false },
    },
    resultValues: { pass: 1, partial: 0.5, fail: 0 },
    confidenceWeights: { none: 0, low: 0.33, medium: 0.67, high: 1 },
    penalties: {
      bySeverity: { critical: 40, high: 25, medium: 12, low: 5, info: 0 },
      decay: 0.7,
      maxPerDimension: 60,
    },
    blockingSeverities: ['critical'],
    evidence: { minHits: 1, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 80, rejectBelow: 35 },
    loop: { maxIterations: 3, plateauAfter: 2, concurrency: 2 },
  },
  ...overrides,
});

export const makeRunSummary = (
  overrides: Partial<QualityRunSummaryDto> = {},
): QualityRunSummaryDto => ({
  runId: '2026-09-06T00-00-00-000-abc123-quality',
  pipeline: 'system-design',
  pipelineVersion: '1.0.0',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:05:17.000Z',
  finalDecision: 'revise',
  stopReason: 'max-iterations',
  overall: 65.2,
  iterations: 1,
  criteria: 2,
  exchangeCount: 4,
  llm: { model: 'test-model' },
  ...overrides,
});

/** Newest first, as `GET /runs` lists them: one live, one revised, one accepted. */
export const RUN_SUMMARIES: QualityRunSummaryDto[] = [
  makeRunSummary({
    runId: '2026-09-06T01-00-00-000-def456-quality',
    status: 'running',
    startedAt: '2026-09-06T01:00:00.000Z',
    finishedAt: null,
    finalDecision: null,
    stopReason: null,
    overall: null,
    iterations: 0,
    criteria: 0,
    exchangeCount: 1,
  }),
  makeRunSummary(),
  makeRunSummary({
    runId: '2026-09-05T23-00-00-000-000aaa-quality',
    startedAt: '2026-09-05T23:00:00.000Z',
    finishedAt: '2026-09-05T23:10:30.000Z',
    finalDecision: 'accept',
    stopReason: 'accepted',
    overall: 100,
    iterations: 2,
    exchangeCount: 18,
  }),
];
