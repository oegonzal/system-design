import { describe, expect, it } from 'vitest';

import { CANVAS_MAX_TOTAL_OPERATIONS, NODE_OPERATIONS_BOUND } from './canvas';
import { canvasGraphSchema, type CanvasGraph } from './canvas.schema';
import { validateGraphReferences } from './graph-validator';

const graph = (overrides: Partial<CanvasGraph> = {}): CanvasGraph => ({
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Shopper' },
    {
      id: 'n-2',
      kind: 'service',
      label: 'API',
      operations: [{ name: 'placeOrder', kind: 'command' }],
    },
    {
      id: 'n-3',
      kind: 'queue',
      label: 'Orders',
      operations: [{ name: 'OrderPlaced', kind: 'event' }],
    },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['placeOrder'] },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'async', carries: ['OrderPlaced'] },
  ],
  ...overrides,
});

describe('validateGraphReferences', () => {
  it('[DEL-5] accepts a graph whose references all resolve', () => {
    expect(validateGraphReferences(graph())).toEqual([]);
  });

  it('names duplicate node ids, edge ids, operation names and config keys', () => {
    const problems = validateGraphReferences(
      graph({
        nodes: [
          { id: 'n-1', kind: 'client', label: '' },
          {
            id: 'n-1',
            kind: 'service',
            label: '',
            config: [
              { key: 'replicas', value: 1 },
              { key: 'replicas', value: 2 },
            ],
            operations: [{ name: 'a' }, { name: 'a' }],
          },
        ],
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-1', kind: 'sync' },
          { id: 'e-1', source: 'n-1', target: 'n-1', kind: 'sync' },
        ],
      }),
    );
    expect(problems).toContain('duplicate node id: n-1');
    expect(problems).toContain('node n-1 sets config key replicas twice');
    expect(problems).toContain('node n-1 declares duplicate operation name: a');
    expect(problems).toContain('duplicate edge id: e-1');
    expect(problems).toContain('edge e-1 is a self-loop on node: n-1');
  });

  it('rejects an edge to a node that is not on the canvas', () => {
    const problems = validateGraphReferences(
      graph({ edges: [{ id: 'e-9', source: 'n-1', target: 'ghost', kind: 'sync' }] }),
    );
    expect(problems).toEqual(['edge e-9 references unknown target node: ghost']);
  });

  it('[DEL-5] accepts a carry declared on either endpoint and rejects one declared on neither', () => {
    // Declared on the target (a call) and on the source (a channel's message type).
    expect(validateGraphReferences(graph())).toEqual([]);
    const problems = validateGraphReferences(
      graph({
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['refund', 'refund'] },
        ],
      }),
    );
    expect(problems).toContain('edge e-1 lists duplicate carries entry: refund');
    expect(problems).toContain('edge e-1 carries refund, which neither n-1 nor n-2 declares');
  });

  // The budget is the only cap the schema does not hold, so the fixture has to
  // be a graph the schema ACCEPTS — otherwise neither route ever reaches this
  // rule and the test proves nothing. The smallest such graph fills
  // ceil((400 + 1) / 12) = 34 nodes to their own cap.
  it('holds the whole-graph operation budget on a graph the schema accepts', () => {
    const nodeCount = Math.ceil((CANVAS_MAX_TOTAL_OPERATIONS + 1) / NODE_OPERATIONS_BOUND.target);
    const nodes = Array.from({ length: nodeCount }, (_, n) => ({
      id: `n-${n}`,
      kind: 'service' as const,
      label: `Service ${n}`,
      operations: Array.from({ length: NODE_OPERATIONS_BOUND.target }, (_, i) => ({
        name: `op-${n}-${i}`,
      })),
    }));
    const over = graph({ nodes, edges: [] });
    expect(canvasGraphSchema.safeParse(over).success).toBe(true);
    expect(nodeCount * NODE_OPERATIONS_BOUND.target).toBeGreaterThan(CANVAS_MAX_TOTAL_OPERATIONS);

    expect(validateGraphReferences(over)).toEqual([
      `graph declares ${nodeCount * NODE_OPERATIONS_BOUND.target} operations — the maximum is ${CANVAS_MAX_TOTAL_OPERATIONS}`,
    ]);

    // One node fewer cannot reach the budget, so the rule is not merely always on.
    const under = graph({ nodes: nodes.slice(0, nodeCount - 1), edges: [] });
    expect(canvasGraphSchema.safeParse(under).success).toBe(true);
    expect(validateGraphReferences(under)).toEqual([]);
  });

  it('[UX-31] refuses a node drawn as a platform service in a role the service does not play, and accepts any role it does', () => {
    const asQueue = graph({
      nodes: [{ id: 'n-1', kind: 'queue', service: 'aws.sqs', label: 'Orders' }],
      edges: [],
    });
    expect(validateGraphReferences(asQueue)).toEqual([]);
    const asCache = graph({
      nodes: [{ id: 'n-1', kind: 'cache', service: 'aws.sqs', label: 'Orders' }],
      edges: [],
    });
    expect(validateGraphReferences(asCache)).toEqual([
      'node n-1 is aws.sqs (SQS), which the platform offers as queue, not as cache',
    ]);
    // A service with several roles plays any of them.
    const asWorker = graph({
      nodes: [{ id: 'n-1', kind: 'worker', service: 'aws.lambda', label: 'Indexer' }],
      edges: [],
    });
    expect(validateGraphReferences(asWorker)).toEqual([]);
  });

  it('names a config key a connection sets twice, as it does for a node', () => {
    const problems = validateGraphReferences(
      graph({
        edges: [
          {
            id: 'e-1',
            source: 'n-1',
            target: 'n-2',
            kind: 'sync',
            config: [
              { key: 'timeoutMs', value: 300 },
              { key: 'timeoutMs', value: 500 },
            ],
          },
        ],
      }),
    );
    expect(problems).toEqual(['edge e-1 sets config key timeoutMs twice']);
  });
});
