/**
 * Builders the canvas specs share. Pure helpers only — no vitest imports — so
 * the file compiles under the app tsconfig. `sampleSubmission` is the order
 * history design the studio's old engine graded at the top of its scale,
 * translated to the one submission schema: a storefront pushing webhooks, a
 * point-of-sale system polled on a schedule, an owned read model behind a
 * queue and an idempotent indexer (`testing.graph.ts` holds the diagram).
 * `sampleCriteria` is the rubric it answers.
 */
import type {
  DesignBrief,
  DesignModel,
  DesignNarrative,
  SuccessCriterion,
} from '@sysdesign/contracts';

import type { CanvasSubmission } from './output';
import { sampleGraph } from './testing.graph';

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
  {
    id: 'c7',
    kind: 'domain_model',
    statement: 'An order is owned by the history store once, whichever source it came from.',
  },
  {
    id: 'c8',
    kind: 'interface',
    statement:
      'The storefront webhook is accepted idempotently: a redelivered order is stored once.',
  },
  {
    id: 'c9',
    kind: 'workflow',
    statement: 'A refund issued in store reaches the order it belongs to and is shown on it.',
  },
  {
    id: 'c10',
    kind: 'tradeoff',
    statement: 'The choice to own a read model rather than query both sources live is defended.',
  },
];

export const sampleBrief = (): DesignBrief => ({
  version: 1,
  bindings: [
    {
      criterionId: 'c1',
      nodeIds: ['gateway-1', 'service-1', 'database-1'],
      path: ['edge-1', 'edge-2', 'edge-3'],
      claim: "the history service reads the customer's own shard; no fan-out",
      entityIds: ['order'],
      tradeoff:
        'an owned read model rather than fanning out to both sources per request: a bounded staleness in exchange for a POS outage never reaching a shopper',
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
      tradeoff:
        'a service of its own rather than a route inside the storefront: one more deployable, so the storefront never carries the history load.',
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
  decisions: [
    {
      choice:
        'Own a read model fed by both sources rather than query the storefront and the POS live.',
      alternative: 'Query both sources on every request and merge.',
      cost: 'Orders can lag their source by up to the batch interval; one more store to operate.',
      reconsiderWhen:
        'If both sources ever answer within the latency budget and never go down together.',
      nodeIds: ['database-1', 'queue-1'],
    },
  ],
  assumptions: ['A shopper reads only their own history; no cross-customer view is needed.'],
});

export const sampleModel = (): DesignModel => ({
  version: 1,
  entities: [
    {
      id: 'order',
      name: 'Order',
      ownerNodeId: 'database-1',
      key: 'order id from the source, namespaced by channel',
      fields: [
        { name: 'customerId' },
        { name: 'placedAt' },
        { name: 'channel', note: 'online or in-store' },
      ],
      invariants: ['An order is stored once, whichever source it came from.'],
      states: ['placed', 'fulfilled', 'refunded'],
    },
    {
      id: 'line-item',
      name: 'Line item',
      ownerNodeId: 'database-1',
      fields: [{ name: 'sku' }, { name: 'quantity' }],
      invariants: [],
      states: [],
    },
  ],
  relations: [{ from: 'order', to: 'line-item', kind: 'contains' }],
});

export const sampleSubmission = (overrides: Partial<CanvasSubmission> = {}): CanvasSubmission => ({
  graph: sampleGraph(),
  brief: sampleBrief(),
  narrative: sampleNarrative(),
  model: sampleModel(),
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
