import type {
  CriterionResultDto,
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDetailDto,
  EvaluationDto,
  EvaluationFindingDto,
  ExperienceProfileDto,
  ImproveIterationDto,
  ImproveIterationOutcome,
  ImproveRunDto,
  PromptDto,
  PromptGenerationDto,
  PromptLibraryDocumentDto,
  RunHeartbeatDto,
  RunRecallDto,
  StarStoryDto,
  SuccessCriterion,
} from '@sysdesign/contracts';

import { makeBrief, makeGraph, makeNarrative } from './canvas-fixtures';

/**
 * Deterministic fixtures — no randomness, no clocks. Overrides merge shallow,
 * which is all these flat DTOs need. Kept vitest-free so Storybook stories
 * can import them too.
 */

const AT = '2026-08-20T12:00:00.000Z';

/** The pace the loop reports by default: a beat a minute, a run given up after three silent minutes. */
export function makeHeartbeat(overrides: Partial<RunHeartbeatDto> = {}): RunHeartbeatDto {
  return { heartbeatEveryMs: 60_000, staleAfterMs: 180_000, ...overrides };
}

/** The rubric every fixture cites: two functional, one quality, one scale, one constraint. */
export function makeCriteria(): SuccessCriterion[] {
  return [
    { id: 'c1', kind: 'functional', statement: 'A shopper reads their merged order history' },
    { id: 'c2', kind: 'functional', statement: 'An online order is visible within a minute' },
    { id: 'c3', kind: 'non_functional', statement: 'p99 read latency stays under 200 ms' },
    { id: 'c4', kind: 'scale', statement: '2,000 reads per second at peak' },
    { id: 'c5', kind: 'constraint', statement: 'The storefront only delivers orders by webhook' },
  ];
}

export const PROMPT_MARKDOWN = [
  '# Design an order-history service',
  '',
  '## Scenario',
  'Online orders live in a hosted storefront that pushes webhooks; in-store orders live in a POS that only answers polling. Merge both into one per-customer history.',
  '',
  '## Functional requirements',
  '1. A shopper reads their merged order history',
  '2. An online order is visible within a minute',
  '',
  '## Non-functional requirements',
  '| Kind | Requirement | Target |',
  '| --- | --- | --- |',
  '| latency | Reads stay fast under load | p99 ≤ 200 ms |',
  '',
  '## Scale targets',
  '| Metric | Target |',
  '| --- | --- |',
  '| Peak reads | 2,000 rps |',
  '',
  '## Constraints',
  '- The storefront only delivers orders by webhook',
].join('\n');

export function makePrompt(overrides: Partial<PromptDto> = {}): PromptDto {
  return {
    id: 'prompt-1',
    experienceId: 'exp-1',
    title: 'Design an order-history service',
    markdown: PROMPT_MARKDOWN,
    criteria: makeCriteria(),
    source: 'authored',
    format: 'system',
    status: 'active',
    rubricLocked: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function makePromptGeneration(
  overrides: Partial<PromptGenerationDto> = {},
): PromptGenerationDto {
  return {
    runId: 'gen-run-1',
    status: 'running',
    decision: null,
    overall: null,
    prompt: null,
    error: null,
    ...overrides,
  };
}

export function makeLibraryDocument(
  overrides: Partial<PromptLibraryDocumentDto> = {},
): PromptLibraryDocumentDto {
  return {
    id: 'order-history',
    title: 'Order history integration',
    folder: null,
    markdown: PROMPT_MARKDOWN,
    ...overrides,
  };
}

export function makeExperience(
  overrides: Partial<ExperienceProfileDto> = {},
): ExperienceProfileDto {
  return {
    id: 'exp-1',
    slug: 'flash-sale',
    origin: 'own',
    companyLabel: 'TicketWave',
    title: 'Flash-sale ticketing platform',
    summary: 'Survived on-sale spikes of 40x baseline traffic.',
    techStack: ['node', 'postgres', 'redis'],
    highlights: [
      'Queue-based checkout',
      'Read-replica fanout',
      '15,000 requests per second at peak',
    ],
    practiceHighlights: [],
    createdAt: AT,
    ...overrides,
  };
}

export function makeSession(
  overrides: Partial<DesignSessionDetailDto> = {},
): DesignSessionDetailDto {
  return {
    id: 'session-1',
    promptId: 'prompt-1',
    promptTitle: 'Design an order-history service',
    status: 'in-progress',
    revisionCount: 1,
    latestRevisionNumber: 1,
    latestOverall: 72,
    latestDecision: 'revise',
    latestEvaluationStatus: 'complete',
    draft: null,
    inFlight: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function makeRevisionSummary(
  overrides: Partial<DesignRevisionSummaryDto> = {},
): DesignRevisionSummaryDto {
  return {
    id: 'rev-1',
    revisionNumber: 1,
    origin: 'user',
    evaluation: {
      runId: 'run-1',
      iteration: 1,
      status: 'complete',
      overall: 72,
      decision: 'revise',
    },
    createdAt: AT,
    ...overrides,
  };
}

export function makeRevision(overrides: Partial<DesignRevisionDto> = {}): DesignRevisionDto {
  return {
    id: 'rev-1',
    sessionId: 'session-1',
    revisionNumber: 1,
    origin: 'user',
    graph: makeGraph(),
    brief: makeBrief(),
    narrative: makeNarrative(),
    model: null,
    evaluation: {
      runId: 'run-1',
      iteration: 1,
      status: 'complete',
      overall: 72,
      decision: 'revise',
    },
    createdAt: AT,
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<EvaluationFindingDto> = {}): EvaluationFindingDto {
  return {
    id: 'unhandled_failure|node.3',
    lenses: ['critic.structure'],
    type: 'unhandled_failure',
    severity: 'high',
    confidence: 'high',
    fixability: 'fixable_local',
    criterionIds: ['c3'],
    locations: [
      {
        ref: 'node.3',
        label: 'n-3 · database · Orders DB',
        part: 'node',
        key: 'n-3',
        name: 'Orders DB',
      },
    ],
    mentions: [],
    nodeIds: ['n-3'],
    edgeIds: [],
    locationRefs: ['node.3'],
    rationale:
      'A single primary is both the read bottleneck and the single point of failure; one replica buys read fanout and a failover target.',
    reconciledTo: null,
    ...overrides,
  };
}

export function makeCriterionResult(
  overrides: Partial<CriterionResultDto> = {},
): CriterionResultDto {
  return {
    criterionId: 'c1',
    result: 'pass',
    confidence: 'high',
    rationale: 'The binding traces the read from the client to the orders database.',
    locations: [],
    mentions: [],
    ...overrides,
  };
}

export function makeEvaluation(overrides: Partial<EvaluationDto> = {}): EvaluationDto {
  const status = overrides.status ?? 'complete';
  return {
    runId: 'run-1',
    iteration: 1,
    startedAt: AT,
    heartbeatAt: AT,
    readAt: AT,
    status,
    // A running grade's run is still going; a terminal one's has stopped.
    settled: status !== 'running',
    llm: { model: 'test-model' },
    overall: 72,
    unscored: null,
    decision: 'revise',
    // The controller's sentence and what settled it, as the route writes them together.
    decisionReason: '1 remediation(s) to apply',
    decisionBasis: {
      factor: 'route',
      facts: {},
      remediations: 1,
      criteria: { assessed: 5, total: 5 },
    },
    dimensions: { coverage: 80, qualities: 60, compliance: 90 },
    findings: [makeFinding()],
    criterionResults: [
      makeCriterionResult(),
      makeCriterionResult({ criterionId: 'c2', result: 'partial', confidence: 'medium' }),
      makeCriterionResult({
        criterionId: 'c3',
        result: 'fail',
        confidence: 'high',
        rationale: 'A single primary cannot hold the latency target under the stated load.',
      }),
      makeCriterionResult({ criterionId: 'c4', result: 'partial', confidence: 'low' }),
      makeCriterionResult({ criterionId: 'c5', result: 'pass', confidence: 'high' }),
    ],
    // A plain grade carries no stop reason: the API tells one only when it is news.
    stopReason: null,
    degraded: [],
    error: null,
    ...overrides,
  };
}

/**
 * One coach iteration. Iteration 1 is the base the run started from; a later
 * one with a revision id was imported, without one it was not better —
 * unless the override says otherwise.
 */
export function makeImproveIteration(
  overrides: Partial<ImproveIterationDto> = {},
): ImproveIterationDto {
  const iteration = overrides.iteration ?? 1;
  const revisionId =
    overrides.revisionId === undefined ? (iteration === 1 ? 'rev-1' : null) : overrides.revisionId;
  const outcome: ImproveIterationOutcome =
    overrides.outcome ??
    (iteration === 1 ? 'base' : revisionId !== null ? 'imported' : 'not-better');
  return {
    iteration,
    mode: iteration === 1 ? 'provided' : 'revise',
    overall: 64,
    unscored: null,
    decision: 'revise',
    reason: '1 remediation(s) to apply',
    decisionBasis: {
      factor: 'route',
      facts: {},
      remediations: 1,
      criteria: { assessed: 5, total: 5 },
    },
    findings: [],
    problems: [],
    ...overrides,
    outcome,
    revisionId,
  };
}

/** A recall that handed the coach two lessons, as the loop records one. */
export function makeRecall(overrides: Partial<RunRecallDto> = {}): RunRecallDto {
  const lessons = overrides.lessons ?? [
    {
      ref: 'm1',
      serves: 'the read path',
      insight: 'Put a cache in front of the primary database before adding read replicas.',
      caveat: null,
      text: 'When reads dominate, cache before you replicate.',
      sourceRunId: 'run-earlier',
      pipeline: 'system-design-canvas',
      iteration: 2,
      decision: 'revise',
      when: '2026-10-01',
    },
    {
      ref: 'm2',
      serves: 'failure handling',
      insight: 'Say what the queue absorbs when the downstream service slows down.',
      caveat: 'learned on a different prompt',
      text: 'Name the failure a queue absorbs, or it absorbs nothing.',
      sourceRunId: 'run-earlier',
      pipeline: 'system-design',
      iteration: 1,
      decision: 'accept',
      when: '2026-09-28',
    },
  ];
  return {
    status: 'recalled',
    reason: null,
    note: null,
    recallRunId: 'run-recall',
    count: lessons.length,
    lessons,
    focus: null,
    novelty: null,
    deferred: 0,
    ...overrides,
  };
}

export function makeImproveRun(overrides: Partial<ImproveRunDto> = {}): ImproveRunDto {
  return {
    runId: 'run-2',
    sessionId: 'session-1',
    baseRevisionId: 'rev-1',
    maxIterations: 3,
    status: 'running',
    startedAt: AT,
    heartbeatAt: AT,
    readAt: AT,
    llm: { model: 'test-model' },
    exchangeCount: 4,
    iterations: [makeImproveIteration()],
    stopReason: null,
    error: null,
    recall: null,
    ...overrides,
  };
}

export function makeStory(overrides: Partial<StarStoryDto> = {}): StarStoryDto {
  return {
    id: 'story-1',
    title: 'The replica that saved the on-sale',
    situation: 'Our single Postgres primary hit 95% CPU during a flash sale.',
    task: 'I owned the data tier and had two weeks before the next on-sale.',
    action: 'Added a read replica, moved availability reads to it, added a failover runbook.',
    result: 'p99 read latency dropped 60%; the next on-sale ran without incident.',
    tags: ['postgres', 'replication', 'incident'],
    promptId: null,
    experienceId: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}
