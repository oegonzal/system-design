/**
 * Builders the canvas specs share. Pure helpers only — no vitest imports — so
 * the file compiles under the app tsconfig. `sampleSubmission` is the order
 * history design the studio's old engine graded at the top of its scale,
 * translated to the one submission schema: a storefront pushing webhooks, a
 * point-of-sale system polled on a schedule, an owned read model behind a
 * queue and an idempotent indexer. `sampleCriteria` is the rubric it answers.
 */
import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  SuccessCriterion,
} from '@sysdesign/contracts';

import type { CanvasSubmission } from './output';

export const sampleCriteria = (): SuccessCriterion[] => [
  {
    id: 'c1',
    kind: 'functional',
    statement: "Return a customer's past orders newest first, each with its line items.",
  },
  {
    id: 'c2',
    kind: 'functional',
    statement: 'Ingest online orders as the storefront pushes them.',
  },
  {
    id: 'c3',
    kind: 'functional',
    statement: 'Import in-store orders from the point-of-sale system.',
  },
  {
    id: 'c4',
    kind: 'non_functional',
    statement: 'Order history reads answer within 300 ms at the 99th percentile.',
  },
  { id: 'c5', kind: 'scale', statement: '2,000 order-history requests per second at peak.' },
  {
    id: 'c6',
    kind: 'constraint',
    statement:
      "The point-of-sale system only answers polling; it is never called on a customer's request.",
  },
];

export const sampleGraph = (): CanvasGraph => ({
  nodes: [
    { id: 'client-1', kind: 'client', label: 'Shopper', position: { x: 0, y: 200 } },
    {
      id: 'gateway-1',
      kind: 'gateway',
      label: 'API gateway',
      config: [
        { key: 'authMode', value: 'jwt' },
        { key: 'rateLimit', value: true },
      ],
      position: { x: 240, y: 200 },
    },
    {
      id: 'service-1',
      kind: 'service',
      label: 'History service',
      config: [
        { key: 'replicas', value: 4 },
        { key: 'rpsPerInstance', value: 500 },
        { key: 'autoscaling', value: true },
      ],
      responsibilities: ['serves the order history read model'],
      operations: [
        { name: 'listOrders', kind: 'query' },
        { name: 'getOrder', kind: 'query' },
        { name: 'getSpendSummary', kind: 'query' },
        { name: 'resyncCustomer', kind: 'command', idempotent: true },
      ],
      position: { x: 500, y: 200 },
    },
    {
      id: 'service-2',
      kind: 'service',
      label: 'Webhook receiver',
      config: [
        { key: 'replicas', value: 2 },
        { key: 'idempotent', value: true },
      ],
      operations: [{ name: 'receiveStorefrontWebhook', kind: 'command', idempotent: true }],
      position: { x: 240, y: -40 },
    },
    {
      id: 'batch-job-1',
      kind: 'batch-job',
      label: 'POS importer',
      config: [
        { key: 'pollIntervalSeconds', value: 120 },
        { key: 'idempotent', value: true },
      ],
      operations: [{ name: 'importPosOrders', kind: 'command', idempotent: true }],
      position: { x: 240, y: 440 },
    },
    {
      id: 'queue-1',
      kind: 'queue',
      label: 'Orders queue',
      config: [
        { key: 'delivery', value: 'at-least-once' },
        { key: 'ordering', value: 'per-key' },
        { key: 'dlq', value: true },
        { key: 'maxRetries', value: 5 },
      ],
      operations: [
        { name: 'OrderReceivedOnline', kind: 'event' },
        { name: 'OrderReceivedOffline', kind: 'event' },
        { name: 'OrderRefunded', kind: 'event' },
      ],
      position: { x: 500, y: 40 },
    },
    {
      id: 'worker-1',
      kind: 'worker',
      label: 'Order indexer',
      config: [
        { key: 'replicas', value: 2 },
        { key: 'idempotent', value: true },
      ],
      operations: [{ name: 'ingestIndex', kind: 'command', idempotent: true }],
      position: { x: 760, y: 40 },
    },
    {
      id: 'event-stream-1',
      kind: 'event-stream',
      label: 'Order events',
      config: [
        { key: 'partitions', value: 12 },
        { key: 'partitionKey', value: 'customer_id' },
        { key: 'retentionHours', value: 168 },
        { key: 'delivery', value: 'at-least-once' },
      ],
      operations: [
        { name: 'OrderIndexed', kind: 'event' },
        { name: 'IngestFailed', kind: 'event' },
      ],
      position: { x: 1020, y: 40 },
    },
    {
      id: 'stream-processor-1',
      kind: 'stream-processor',
      label: 'Spend aggregator',
      config: [
        { key: 'parallelism', value: 4 },
        { key: 'checkpointing', value: true },
      ],
      position: { x: 1280, y: 120 },
    },
    {
      id: 'notification-service-1',
      kind: 'notification-service',
      label: 'Ops alerts',
      position: { x: 1280, y: -40 },
    },
    {
      id: 'database-1',
      kind: 'database',
      label: 'Order history DB',
      config: [
        { key: 'consistency', value: 'strong' },
        { key: 'sharding', value: 'hash' },
        { key: 'partitionKey', value: 'customer_id' },
        { key: 'replicas', value: 2 },
        { key: 'backups', value: true },
      ],
      position: { x: 760, y: 320 },
    },
    {
      id: 'external-1',
      kind: 'external-api',
      label: 'Online storefront',
      config: [
        { key: 'webhooks', value: true },
        { key: 'timeoutMs', value: 2000 },
        { key: 'circuitBreaker', value: true },
      ],
      position: { x: 0, y: -40 },
    },
    {
      id: 'external-2',
      kind: 'external-api',
      label: 'Retail POS',
      config: [
        { key: 'timeoutMs', value: 3000 },
        { key: 'retries', value: 2 },
        { key: 'circuitBreaker', value: true },
      ],
      position: { x: 0, y: 440 },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'client-1', target: 'gateway-1', kind: 'sync' },
    {
      id: 'edge-2',
      source: 'gateway-1',
      target: 'service-1',
      kind: 'sync',
      carries: ['listOrders', 'getOrder', 'getSpendSummary', 'resyncCustomer'],
    },
    { id: 'edge-3', source: 'service-1', target: 'database-1', kind: 'sync', label: 'read' },
    {
      id: 'edge-4',
      source: 'external-1',
      target: 'service-2',
      kind: 'async',
      carries: ['receiveStorefrontWebhook'],
    },
    {
      id: 'edge-5',
      source: 'service-2',
      target: 'queue-1',
      kind: 'async',
      carries: ['OrderReceivedOnline', 'OrderRefunded'],
    },
    { id: 'edge-6', source: 'batch-job-1', target: 'external-2', kind: 'sync', label: 'poll' },
    {
      id: 'edge-7',
      source: 'batch-job-1',
      target: 'queue-1',
      kind: 'async',
      carries: ['OrderReceivedOffline'],
    },
    {
      id: 'edge-8',
      source: 'queue-1',
      target: 'worker-1',
      kind: 'async',
      carries: ['OrderReceivedOnline', 'OrderReceivedOffline', 'OrderRefunded'],
    },
    { id: 'edge-9', source: 'worker-1', target: 'database-1', kind: 'sync', label: 'write' },
    {
      id: 'edge-10',
      source: 'worker-1',
      target: 'event-stream-1',
      kind: 'async',
      carries: ['OrderIndexed', 'IngestFailed'],
    },
    {
      id: 'edge-11',
      source: 'event-stream-1',
      target: 'stream-processor-1',
      kind: 'async',
      carries: ['OrderIndexed'],
    },
    {
      id: 'edge-12',
      source: 'event-stream-1',
      target: 'notification-service-1',
      kind: 'async',
      carries: ['IngestFailed'],
    },
    {
      id: 'edge-13',
      source: 'stream-processor-1',
      target: 'database-1',
      kind: 'sync',
      label: 'write',
    },
  ],
});

export const sampleBrief = (): DesignBrief => ({
  version: 1,
  bindings: [
    {
      criterionId: 'c1',
      nodeIds: ['gateway-1', 'service-1', 'database-1'],
      path: ['edge-1', 'edge-2', 'edge-3'],
      claim: "the history service reads the customer's own shard; no fan-out",
    },
    {
      criterionId: 'c2',
      nodeIds: ['service-2', 'queue-1', 'worker-1'],
      path: ['edge-4', 'edge-5', 'edge-8', 'edge-9'],
      claim: 'a webhook is acknowledged once queued and indexed by an idempotent worker',
    },
    {
      criterionId: 'c3',
      nodeIds: ['batch-job-1', 'queue-1', 'worker-1'],
      path: ['edge-7', 'edge-8', 'edge-9'],
      claim: 'the importer polls the POS every two minutes and publishes each order once',
    },
    {
      criterionId: 'c4',
      nodeIds: ['service-1', 'database-1'],
      claim: 'one shard keyed by customer answers every read; nothing else is on the path',
    },
    {
      criterionId: 'c5',
      nodeIds: ['gateway-1', 'service-1'],
      claim: 'four instances at 500 rps each, autoscaling on the gateway rate',
    },
    {
      criterionId: 'c6',
      nodeIds: ['batch-job-1'],
      claim: 'only the importer talks to the POS, on its own schedule',
    },
  ],
});

export const sampleNarrative = (): DesignNarrative => ({
  version: 1,
  overview:
    'Two intakes — pushed webhooks and a polled POS — feed one queue; an idempotent indexer owns the read model the history service answers from.',
  componentRationales: [
    {
      nodeId: 'service-1',
      prose: 'Stateless read path over the customer shard so a POS outage never touches a shopper.',
    },
    {
      nodeId: 'queue-1',
      prose:
        'Absorbs webhook bursts and POS batches alike; per-key ordering keeps refunds after orders.',
    },
    {
      nodeId: 'batch-job-1',
      prose:
        'The only caller of the POS, on a two-minute schedule, so the constraint holds by construction.',
    },
    {
      nodeId: 'database-1',
      prose: 'Hash-sharded on customer id: one shard per read, replicated twice, backed up.',
    },
  ],
  criterionNarrations: [
    {
      criterionId: 'c1',
      prose:
        'Shopper → gateway → history service → the customer shard; newest first is an index order.',
    },
    {
      criterionId: 'c2',
      prose:
        'The storefront posts a webhook; the receiver enqueues and acknowledges; the indexer writes once.',
    },
    {
      criterionId: 'c6',
      prose: 'No request path reaches the POS; the importer alone polls it.',
    },
  ],
});

export const sampleSubmission = (overrides: Partial<CanvasSubmission> = {}): CanvasSubmission => ({
  graph: sampleGraph(),
  brief: sampleBrief(),
  narrative: sampleNarrative(),
  ...overrides,
});

/** The sample with a read replica the coach added — every author id kept, the new parts prefixed `ai-`. */
export const coachedSubmission = (): CanvasSubmission => {
  const base = sampleSubmission();
  return {
    graph: {
      nodes: [
        ...base.graph.nodes,
        {
          id: 'ai-replica-1',
          kind: 'replica',
          label: 'History read replica',
          config: [{ key: 'lagMs', value: 200 }],
        },
      ],
      edges: [
        ...base.graph.edges,
        { id: 'ai-edge-1', source: 'database-1', target: 'ai-replica-1', kind: 'async' },
        {
          id: 'ai-edge-2',
          source: 'service-1',
          target: 'ai-replica-1',
          kind: 'sync',
          label: 'read',
        },
      ],
    },
    brief: base.brief,
    narrative: base.narrative,
  };
};
