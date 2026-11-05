import type { Binding, CanvasGraph, DesignBrief, DesignNarrative } from '@sysdesign/contracts';

/**
 * What an author draws and writes, as the specs and stories start from it:
 * the graph, the brief that binds criteria to it, and the narrative beside it.
 * Deterministic, and vitest-free like the rest of `testing/`.
 */

/** client → service → database; the database carries one typed config entry. */
export function makeGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client', position: { x: 40, y: 40 } },
      { id: 'n-2', kind: 'service', label: 'Order Service', position: { x: 40, y: 200 } },
      {
        id: 'n-3',
        kind: 'database',
        label: 'Orders DB',
        config: [{ key: 'replicas', value: 1 }],
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
 * A design drawn on a platform: a client at a managed front door, a function
 * behind it, a queue it publishes to and a worker draining it — every block
 * but the client naming the catalogue service it is, and the async hop
 * declaring how it is made and what happens when it fails.
 */
export function makePlatformGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Shopper', position: { x: 40, y: 40 } },
      {
        id: 'n-2',
        kind: 'gateway',
        service: 'aws.api-gateway',
        label: 'Orders API',
        position: { x: 40, y: 200 },
      },
      {
        id: 'n-3',
        kind: 'serverless-function',
        service: 'aws.lambda',
        label: 'Place order',
        position: { x: 40, y: 360 },
      },
      {
        id: 'n-4',
        kind: 'queue',
        service: 'aws.sqs',
        label: 'Order events',
        config: [{ key: 'queueType', value: 'fifo' }],
        position: { x: 40, y: 520 },
      },
      {
        id: 'n-5',
        kind: 'worker',
        service: 'aws.lambda',
        label: 'Indexer',
        position: { x: 40, y: 680 },
      },
    ],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
      { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
      {
        id: 'e-3',
        source: 'n-3',
        target: 'n-4',
        kind: 'async',
        config: [
          { key: 'delivery', value: 'at-least-once' },
          { key: 'dlq', value: true },
        ],
      },
      { id: 'e-4', source: 'n-4', target: 'n-5', kind: 'async' },
    ],
    ...overrides,
  };
}

/**
 * A graph exercising the interface layer: declared operations on the
 * gateway/service, responsibilities on the service, an event on the queue,
 * and carries on the call and produce/consume edges.
 */
export function makeInterfaceGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client', position: { x: 40, y: 40 } },
      {
        id: 'n-2',
        kind: 'gateway',
        label: 'API Gateway',
        config: [{ key: 'rateLimit', value: true }],
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
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['PlaceOrder'] },
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

export function makeBinding(overrides: Partial<Binding> = {}): Binding {
  return {
    criterionId: 'c1',
    nodeIds: ['n-2', 'n-3'],
    path: ['e-1', 'e-2'],
    claim: 'The service reads the history from the orders database',
    ...overrides,
  };
}

/** Against `makeGraph`: c1 traced end to end, c3 held by the database. */
export function makeBrief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    version: 1,
    bindings: [
      makeBinding(),
      makeBinding({
        criterionId: 'c3',
        nodeIds: ['n-3'],
        path: undefined,
        claim: 'A replica keeps point reads under the budget',
      }),
    ],
    ...overrides,
  };
}

export function makeNarrative(overrides: Partial<DesignNarrative> = {}): DesignNarrative {
  return {
    version: 1,
    overview: 'A read/write split keeps order lookups fast while writes stay strongly ordered.',
    componentRationales: [
      {
        nodeId: 'n-3',
        prose: 'The Orders DB is the source of truth every read reconciles against.',
      },
    ],
    criterionNarrations: [
      { criterionId: 'c1', prose: 'The client asks the service, which reads the orders database.' },
    ],
    ...overrides,
  };
}
