import { describe, expect, it } from 'vitest';

import { CANVAS_MAX_TOTAL_OPERATIONS } from './canvas';
import type { CanvasGraph } from './canvas.schema';
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

  it('holds the whole-graph operation budget', () => {
    const problems = validateGraphReferences(
      graph({
        nodes: Array.from({ length: CANVAS_MAX_TOTAL_OPERATIONS + 1 }, (_, i) => ({
          id: `n-${i}`,
          kind: 'service' as const,
          label: '',
          operations: [{ name: 'op' }],
        })),
        edges: [],
      }),
    );
    expect(problems.at(-1)).toMatch(/the maximum is 400/);
  });
});
