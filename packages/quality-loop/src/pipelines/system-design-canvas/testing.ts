/**
 * Builders the canvas specs share. Pure helpers only — no vitest imports — so
 * the file compiles under the app tsconfig. `sampleSubmission` is the order
 * history design the studio's old engine graded at the top of its scale,
 * translated to the one submission schema: a storefront pushing webhooks, a
 * point-of-sale system polled on a schedule, an owned read model behind a
 * queue and an idempotent indexer (`testing.graph.ts` holds the diagram).
 * `sampleCriteria` is the rubric it answers, and `coachedChange` the change
 * set a coach might return against it — what the loop applies to the best —
 * with the variants the loop specs apply beside it: sloppy, broken,
 * addressed by position, carrying what nothing declares.
 */
import type {
  Binding,
  CanvasChange,
  CanvasEdge,
  CanvasNode,
  DesignBrief,
  DesignDecision,
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
  {
    id: 'c11',
    kind: 'communication',
    statement:
      'The storefront webhook is traced from the receiver to the read model, every hop declaring its call style and what happens when it fails.',
  },
];

export const sampleBrief = (): DesignBrief => ({
  version: 1,
  bindings: [
    {
      criterionId: 'c1',
      nodeIds: ['gateway-1', 'service-1', 'database-1'],
      path: ['edge-1', 'edge-14', 'edge-2', 'edge-3'],
      claim: "the history service reads the customer's own shard; no fan-out",
      entityIds: ['order'],
      tradeoff:
        'an owned read model rather than fanning out to both sources per request: a bounded staleness in exchange for a POS outage never reaching a shopper',
    },
    {
      criterionId: 'c2',
      nodeIds: ['service-2', 'queue-1', 'worker-1'],
      path: ['edge-4', 'edge-14', 'edge-16', 'edge-5', 'edge-8', 'edge-9'],
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
    {
      criterionId: 'c9',
      nodeIds: ['batch-job-1', 'worker-1', 'stream-processor-1', 'database-1'],
      path: ['edge-7', 'edge-8', 'edge-10', 'edge-11', 'edge-13'],
      claim:
        'a refund imported from the POS is indexed, then re-aggregated into the spend summary shown on the order',
    },
  ],
});

/** The one decision the sample records: the read model, defended against querying both sources live. */
const readModelDecision = (): DesignDecision => ({
  choice: 'Own a read model fed by both sources rather than query the storefront and the POS live.',
  alternative: 'Query both sources on every request and merge.',
  cost: 'Orders can lag their source by up to the batch interval; one more store to operate.',
  reconsiderWhen:
    'If both sources ever answer within the latency budget and never go down together.',
  nodeIds: ['database-1', 'queue-1'],
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
        'Shopper → DNS → gateway (TLS ends and the token is checked there, the firewall beside it) → history service → the customer shard; newest first is an index order.',
    },
    {
      criterionId: 'c2',
      prose:
        'The storefront posts a webhook through the same front door; the receiver enqueues and acknowledges; the indexer writes once.',
    },
    {
      criterionId: 'c6',
      prose: 'No request path reaches the POS; the importer alone polls it.',
    },
  ],
  decisions: [readModelDecision()],
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

/** The read replica a coach adds to the sample, its id prefixed `ai-`. */
const readReplica = (): CanvasNode => ({
  id: 'ai-replica-1',
  kind: 'replica',
  label: 'History read replica',
  config: [{ key: 'lagMs', value: 200 }],
});

/**
 * The change set a coach might return against the sample: a read replica —
 * one node and the two edges that wire it, every id prefixed `ai-` — and
 * nothing else named, so every author id and every other part stays as it is.
 */
export const coachedChange = (): CanvasChange => ({
  changes: {
    nodes: { upsert: [readReplica()], remove: [] },
    edges: {
      upsert: [
        { id: 'ai-edge-1', source: 'database-1', target: 'ai-replica-1', kind: 'async' },
        {
          id: 'ai-edge-2',
          source: 'service-1',
          target: 'ai-replica-1',
          kind: 'sync',
          label: 'read',
        },
      ],
      remove: [],
    },
  },
});

/** The change with bindings the coach also rewrote — whole, by criterion id; a later entry for one criterion wins. */
export const withBindingUpserts = (change: CanvasChange, upsert: Binding[]): CanvasChange => ({
  changes: {
    ...change.changes,
    bindings: {
      upsert: [...(change.changes.bindings?.upsert ?? []), ...upsert],
      remove: change.changes.bindings?.remove ?? [],
    },
  },
});

/** What a coach might return: a criterion it invented, one bound criterion rewritten twice in the same change set, and a path that fans out. */
export const sloppyChange = (): CanvasChange => {
  const [c1, c2] = sampleBrief().bindings;
  return withBindingUpserts(coachedChange(), [
    // edge-1 does not start where edge-9 ends: a fan-out tacked onto the walk.
    { ...c2, path: [...(c2.path ?? []), 'edge-1'] },
    { criterionId: 'c99', nodeIds: ['service-1'], claim: 'a criterion the rubric never listed' },
    // Each rewrite replaces the author's c1 binding in place, so the later one
    // is the binding and nothing is bound twice.
    { ...c1, claim: 'the earlier rewrite' },
    { ...c1, claim: 'the later rewrite, which wins' },
  ]);
};

/** A coach change with an edge to a node that is not drawn — a dangling edge the wiring drops, never a refusal. */
export const brokenChange = (): CanvasChange => {
  const coached = coachedChange();
  const dangling: CanvasEdge = {
    id: 'ai-edge-9',
    source: 'service-1',
    target: 'nowhere',
    kind: 'sync',
  };
  return {
    changes: {
      ...coached.changes,
      edges: {
        upsert: [...(coached.changes.edges?.upsert ?? []), dangling],
        remove: coached.changes.edges?.remove ?? [],
      },
    },
  };
};

/**
 * A coach change no wiring can mend: the replica declares one operation name
 * twice, a fault of the node itself, so `references` refuses the revision
 * and the coach is told why.
 */
export const unrepairableChange = (): CanvasChange => ({
  changes: {
    ...coachedChange().changes,
    nodes: {
      upsert: [
        {
          ...readReplica(),
          operations: [
            { name: 'readOrders', kind: 'query' },
            { name: 'readOrders', kind: 'query' },
          ],
        },
      ],
      remove: [],
    },
  },
});

/** The coached change with each of its edges rewritten by `edit`. */
const withEdges = (edit: (edge: CanvasEdge) => CanvasEdge): CanvasChange => {
  const coached = coachedChange();
  return {
    changes: {
      ...coached.changes,
      edges: { upsert: (coached.changes.edges?.upsert ?? []).map(edit), remove: [] },
    },
  };
};

/** The position the render prints beside an author's node — how a coach reading the render addresses it. */
const shownPosition = (nodeId: string): string =>
  `node.${sampleSubmission().graph.nodes.findIndex((node) => node.id === nodeId) + 1}`;

/** The read-model decision with the cost of staleness named, as the sample's reasoning remediation asks. */
export const stalenessDecision = (): DesignDecision => ({
  ...readModelDecision(),
  cost: 'Orders lag their source by up to the batch interval, a bounded staleness a shopper may see; one more store to operate.',
});

/**
 * The coached change as a coach reading the render would write it: the
 * replica's author-side endpoints given as the positions printed beside
 * them, and the first decision rewritten at its position, every other part
 * of the narrative unnamed. Measured 2026-11-08 (arm C): a coach copied such
 * positions as ids and replaced every decision whole.
 */
export const positionalChange = (): CanvasChange => {
  const change = withEdges((edge) => ({ ...edge, source: shownPosition(edge.source) }));
  return {
    changes: {
      ...change.changes,
      decisions: { upsertAt: [{ at: 1, decision: stalenessDecision() }], removeAt: [], append: [] },
    },
  };
};

/** The coached change whose read edge carries one operation its source declares and one nothing on the canvas declares. */
export const undeclaredCarryChange = (): CanvasChange =>
  withEdges((edge) =>
    edge.kind === 'sync' ? { ...edge, carries: ['listOrders', 'nonesuch'] } : edge,
  );
