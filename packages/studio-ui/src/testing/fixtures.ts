import type {
  CanvasGraph,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  EvaluationDto,
  ExperienceProfileDto,
  FindingDto,
  PromptDto,
  StarStoryDto,
} from '@sysdesign/contracts';

/**
 * Deterministic fixtures — no randomness, no clocks. Overrides merge shallow,
 * which is all these flat DTOs need. Kept vitest-free so Storybook stories
 * can import them too.
 */

const AT = '2026-08-20T12:00:00.000Z';

export function makeGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client', position: { x: 40, y: 40 } },
      { id: 'n-2', kind: 'service', label: 'Order Service', position: { x: 40, y: 200 } },
      {
        id: 'n-3',
        kind: 'database',
        label: 'Orders DB',
        config: { replicas: 1 },
        position: { x: 40, y: 360 },
      },
    ],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
      { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync', label: 'writes' },
    ],
    ...overrides,
  };
}

export function makeExperience(
  overrides: Partial<ExperienceProfileDto> = {},
): ExperienceProfileDto {
  return {
    id: 'exp-1',
    slug: 'flash-sale',
    companyLabel: 'TicketWave',
    title: 'Flash-sale ticketing platform',
    summary: 'Survived on-sale spikes of 40x baseline traffic.',
    archetype: 'flash-sale-ticketing',
    techStack: ['node', 'postgres', 'redis'],
    scaleFacts: { concurrentUsers: 120_000, requestsPerSecond: 15_000, peakMultiplier: 40 },
    highlights: ['Queue-based checkout', 'Read-replica fanout'],
    createdAt: AT,
    ...overrides,
  };
}

export function makePrompt(overrides: Partial<PromptDto> = {}): PromptDto {
  return {
    id: 'prompt-1',
    experienceId: 'exp-1',
    archetype: 'flash-sale-ticketing',
    title: 'Design the on-sale checkout path',
    scenario:
      'A ticketing platform announces a stadium tour. At on-sale time, traffic spikes to 40x baseline within 90 seconds.',
    functionalRequirements: [
      'Users can view seat availability in near-real time',
      'Users can hold seats for a bounded window',
      'Confirmed orders are never double-sold',
    ],
    nonFunctionalRequirements: [
      { kind: 'latency', statement: 'Reads stay fast under the spike', target: 'p99 ≤ 200ms' },
      { kind: 'availability', statement: 'Checkout stays up during on-sale', target: '99.95%' },
      { kind: 'consistency', statement: 'No double-sold seats' },
    ],
    scaleTargets: {
      concurrentUsers: 120_000,
      requestsPerSecond: 15_000,
      readWriteRatio: '95:5',
      p99LatencyMs: 200,
      availabilityPct: '99.95',
      dataRetention: '7 years',
    },
    difficulty: 'standard',
    status: 'active',
    seed: 42,
    generatorVersion: '1.0.0',
    llmEnriched: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<DesignSessionDto> = {}): DesignSessionDto {
  return {
    id: 'session-1',
    promptId: 'prompt-1',
    status: 'in-progress',
    revisionCount: 1,
    latestRevisionNumber: 1,
    latestGrade: 'B',
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
    notes: null,
    evaluationStatus: 'complete',
    overallScore: 72,
    grade: 'B',
    createdAt: AT,
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<FindingDto> = {}): FindingDto {
  return {
    id: 'finding-1',
    source: 'rule',
    ruleId: 'reliability.single-db-no-replica',
    dimension: 'reliability',
    severity: 'high',
    title: 'Single database with no replica',
    message:
      'At 15k rps a single primary is both the bottleneck and the single point of failure; one replica buys read fanout and a failover target.',
    affectedNodeIds: ['n-3'],
    affectedEdgeIds: [],
    suggestion: {
      description: 'Add a read replica and route reads to it.',
      ops: [
        {
          op: 'add-node',
          node: {
            id: 'suggested-replica-1',
            kind: 'replica',
            label: 'Read Replica',
            position: { x: 280, y: 360 },
          },
        },
        {
          op: 'add-edge',
          edge: {
            id: 'suggested-edge-1',
            source: 'n-3',
            target: 'suggested-replica-1',
            kind: 'async',
            label: 'replication',
          },
        },
      ],
    },
    ...overrides,
  };
}

export function makeEvaluation(overrides: Partial<EvaluationDto> = {}): EvaluationDto {
  return {
    id: 'eval-1',
    revisionId: 'rev-1',
    status: 'complete',
    overallScore: 72,
    grade: 'B',
    dimensionScores: {
      reliability: 55,
      scalability: 70,
      performance: 78,
      data: 80,
      messaging: 66,
      security: 74,
      hygiene: 82,
    },
    summary: 'Solid read path; reliability is the weak dimension.',
    engineVersion: '2.0.0',
    criticModel: null,
    error: null,
    findings: [makeFinding()],
    startedAt: AT,
    completedAt: AT,
    createdAt: AT,
    updatedAt: AT,
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
