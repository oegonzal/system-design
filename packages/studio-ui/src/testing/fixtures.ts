import type {
  CanvasGraph,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  EvalAxisDto,
  EvaluationDto,
  ExperienceProfileDto,
  FindingDto,
  ImprovementRunDto,
  PromptDto,
  ScenarioReportDto,
  StarStoryDto,
  WorkflowSpec,
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

/**
 * A graph exercising the interface layer: declared operations on the
 * gateway/service, responsibilities on the service, message types on the
 * queue, and carries on the call and produce/consume edges.
 */
export function makeInterfaceGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client', position: { x: 40, y: 40 } },
      {
        id: 'n-2',
        kind: 'gateway',
        label: 'API Gateway',
        operations: [
          { name: 'PlaceOrder', kind: 'command' },
          { name: 'GetOrder', kind: 'query', idempotent: true },
        ],
        position: { x: 40, y: 200 },
      },
      {
        id: 'n-3',
        kind: 'service',
        label: 'Order Service',
        responsibilities: ['Owns the order lifecycle', 'Publishes order events'],
        operations: [
          { name: 'PlaceOrder', kind: 'command', notes: 'Validates inventory first' },
          { name: 'GetOrder', kind: 'query', idempotent: true },
        ],
        position: { x: 40, y: 360 },
      },
      {
        id: 'n-4',
        kind: 'queue',
        label: 'Order Queue',
        operations: [{ name: 'OrderPlaced', kind: 'event' }],
        position: { x: 40, y: 520 },
      },
      { id: 'n-5', kind: 'worker', label: 'Fulfillment Worker', position: { x: 40, y: 680 } },
    ],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
      {
        id: 'e-2',
        source: 'n-2',
        target: 'n-3',
        kind: 'sync',
        carries: ['PlaceOrder', 'GetOrder'],
      },
      {
        id: 'e-3',
        source: 'n-3',
        target: 'n-4',
        kind: 'async',
        label: 'produce',
        carries: ['OrderPlaced'],
      },
      {
        id: 'e-4',
        source: 'n-4',
        target: 'n-5',
        kind: 'async',
        label: 'consume',
        carries: ['OrderPlaced'],
      },
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
    functionalCapabilities: [],
    functionalRequirements: [
      'Users can view seat availability in near-real time',
      'Users can hold seats for a bounded window',
      'Confirmed orders are never double-sold',
    ],
    nonFunctionalRequirements: [
      {
        id: 'fst-lat-read-spike',
        kind: 'latency',
        statement: 'Reads stay fast under the spike',
        target: 'p99 ≤ 200ms',
        targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 200, unit: 'ms' },
      },
      {
        id: 'fst-avail-sale-window',
        kind: 'availability',
        statement: 'Checkout stays up during on-sale',
        target: '99.95%',
        targetSpec: { metric: 'availability_pct', op: '>=', value: 99.95, unit: '%' },
      },
      { id: 'fst-con-oversell', kind: 'consistency', statement: 'No double-sold seats' },
    ],
    scaleTargets: {
      concurrentUsers: 120_000,
      requestsPerSecond: 15_000,
      readWriteRatio: '95:5',
      p99LatencyMs: 200,
      availabilityPct: '99.95',
      dataRetention: '7 years',
    },
    workflowSpec: null,
    difficulty: 'standard',
    status: 'active',
    seed: 42,
    generatorVersion: '2.0.0',
    llmEnriched: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** A compact order-history business layer for workflow-aware surfaces. */
export function makeWorkflowSpec(overrides: Partial<WorkflowSpec> = {}): WorkflowSpec {
  return {
    version: 1,
    entities: [
      {
        id: 'ent-order',
        name: 'Order',
        states: ['received', 'indexed'],
        transitions: [
          { from: null, to: 'received', via: 'ing-webhooks' },
          { from: 'received', to: 'indexed', via: 'op-ingest-index' },
        ],
      },
    ],
    operations: [
      {
        id: 'op-list-orders',
        kind: 'query',
        statement: 'Return the customer’s merged order history',
      },
      {
        id: 'op-ingest-index',
        kind: 'command',
        statement: 'Normalize an incoming order into the read model',
        consumes: ['evt-order-received'],
        emits: ['evt-order-indexed'],
        onFailureEmits: ['evt-ingest-failed'],
      },
    ],
    events: [
      { id: 'evt-order-received', statement: 'A new order arrived from a source' },
      { id: 'evt-order-indexed', statement: 'An order became queryable' },
      { id: 'evt-ingest-failed', statement: 'An order failed normalization' },
    ],
    aggregations: [
      {
        id: 'agg-spend-summary',
        statement: 'A spend summary tile totals purchases',
        sourceEventIds: ['evt-order-indexed'],
      },
    ],
    ingests: [
      {
        id: 'ing-webhooks',
        mode: 'push',
        statement: 'The storefront pushes order webhooks',
        nfrId: 'ohi-fresh-online',
        emits: ['evt-order-received'],
      },
      {
        id: 'ing-pos-import',
        mode: 'pull',
        statement: 'Poll the POS for new orders',
        nfrId: 'ohi-fresh-offline',
        emits: ['evt-order-received'],
      },
    ],
    ...overrides,
  };
}

/** A prompt whose archetype carries the business layer above. */
export function makeWorkflowPrompt(overrides: Partial<PromptDto> = {}): PromptDto {
  return makePrompt({
    id: 'prompt-ohi-1',
    archetype: 'order-history-integration',
    title: 'Design an Order History Integration Service',
    scenario:
      'Online orders live in a hosted storefront (GraphQL plus webhooks), in-store orders in a Retail POS that only answers REST; merge both into one per-customer history.',
    functionalCapabilities: ['analytics', 'scheduled-work'],
    nonFunctionalRequirements: [
      {
        id: 'ohi-fresh-online',
        kind: 'consistency',
        statement: 'An online order is visible within a minute',
        target: 'visible ≤ 60s after purchase',
        targetSpec: { metric: 'freshness_seconds', op: '<=', value: 60, unit: 's' },
      },
      {
        id: 'ohi-fresh-offline',
        kind: 'consistency',
        statement: 'An in-store sale is visible within five minutes',
        target: 'visible ≤ 300s after sale',
        targetSpec: { metric: 'freshness_seconds', op: '<=', value: 300, unit: 's' },
      },
      {
        id: 'ohi-sec-own-orders',
        kind: 'security',
        statement: 'A customer reads only their own orders; guests read none',
      },
    ],
    workflowSpec: makeWorkflowSpec(),
    ...overrides,
  });
}

/** A graph with workflow claims: a serving query, a webhook intake, a wired channel. */
export function makeOrderHistoryGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Shopper', position: { x: 40, y: 40 } },
      {
        id: 'n-2',
        kind: 'gateway',
        label: 'API Gateway',
        config: { authMode: 'jwt' },
        position: { x: 40, y: 180 },
      },
      {
        id: 'n-3',
        kind: 'service',
        label: 'History service',
        operations: [{ name: 'listOrders', kind: 'query', fulfills: 'op-list-orders' }],
        position: { x: 40, y: 320 },
      },
      {
        id: 'n-4',
        kind: 'service',
        label: 'Webhook receiver',
        operations: [
          {
            name: 'receiveWebhook',
            kind: 'command',
            fulfills: 'ing-webhooks',
            emits: ['evt-order-received'],
          },
        ],
        position: { x: 320, y: 40 },
      },
      {
        id: 'n-5',
        kind: 'queue',
        label: 'Orders queue',
        operations: [{ name: 'OrderReceived', kind: 'event', fulfills: 'evt-order-received' }],
        position: { x: 320, y: 180 },
      },
      {
        id: 'n-6',
        kind: 'worker',
        label: 'Indexer',
        operations: [
          {
            name: 'ingestIndex',
            kind: 'command',
            fulfills: 'op-ingest-index',
            emits: ['evt-order-indexed'],
          },
        ],
        position: { x: 320, y: 320 },
      },
      {
        id: 'n-7',
        kind: 'external-api',
        label: 'Storefront',
        config: { webhooks: true },
        position: { x: 600, y: 40 },
      },
      { id: 'n-8', kind: 'database', label: 'History DB', position: { x: 600, y: 320 } },
    ],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
      { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync', carries: ['listOrders'] },
      { id: 'e-3', source: 'n-7', target: 'n-4', kind: 'async', carries: ['receiveWebhook'] },
      { id: 'e-4', source: 'n-4', target: 'n-5', kind: 'async', carries: ['OrderReceived'] },
      { id: 'e-5', source: 'n-5', target: 'n-6', kind: 'async', carries: ['OrderReceived'] },
      { id: 'e-6', source: 'n-6', target: 'n-8', kind: 'sync', intent: 'write' },
      { id: 'e-7', source: 'n-3', target: 'n-8', kind: 'sync', intent: 'read' },
    ],
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
    origin: 'user',
    narrative: null,
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
    expectationId: null,
    nfrId: null,
    scenarioId: null,
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

export function makeAxis(overrides: Partial<EvalAxisDto> = {}): EvalAxisDto {
  return {
    id: 'depth',
    label: 'Depth & justification',
    score: 61,
    subScores: {
      tradeoffArticulation: 55,
      bottleneckAwareness: 70,
      failureDesign: 50,
      dataFlowClarity: 68,
    },
    factors: null,
    summary: 'Mechanisms are named but capacities are defaulted.',
    model: 'claude-sonnet-5',
    ...overrides,
  };
}

export function makeScenarioReport(overrides: Partial<ScenarioReportDto> = {}): ScenarioReportDto {
  return {
    scenarioId: 'thundering-herd',
    title: 'The on-sale thundering herd',
    verdict: 'degrades',
    story: 'The cache absorbs the read storm, but checkout latency triples while the queue drains.',
    weakestNodeIds: ['n-3'],
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
      explanation: 76,
      product: 64,
    },
    summary: 'Solid read path; reliability is the weak dimension.',
    engineVersion: '2.0.0',
    profileId: 'default',
    profileVersion: '2.2.0',
    capApplied: null,
    criticModel: null,
    error: null,
    findings: [makeFinding()],
    axes: [],
    scenarios: [],
    startedAt: AT,
    completedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function makeImprovementRun(overrides: Partial<ImprovementRunDto> = {}): ImprovementRunDto {
  return {
    id: 'run-1',
    sessionId: 'session-1',
    baseRevisionId: 'rev-1',
    bestRevisionId: null,
    status: 'running',
    maxIterations: 6,
    iterations: [
      {
        iteration: 0,
        proposer: 'baseline',
        description: 'The design as submitted.',
        score: 41,
        accepted: true,
        revisionId: 'rev-1',
      },
    ],
    stoppedReason: null,
    error: null,
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
