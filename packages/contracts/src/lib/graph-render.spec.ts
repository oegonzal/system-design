import { describe, expect, it } from 'vitest';

import { NODE_MAX_OPERATIONS } from './canvas';
import { MAX_SERIALIZED_OPS, renderEdgeLine, renderNodeLine } from './graph-render';

describe('renderNodeLine', () => {
  it('prints id, kind, label, config as one object, roles and operations', () => {
    expect(
      renderNodeLine({
        id: 'n-2',
        kind: 'service',
        label: 'Order API',
        config: [
          { key: 'replicas', value: 3 },
          { key: 'autoscaling', value: true },
        ],
        responsibilities: ['owns orders'],
        operations: [
          { name: 'placeOrder', kind: 'command', idempotent: true, notes: 'keyed by cart id' },
          { name: 'listOrders' },
        ],
      }),
    ).toBe(
      '  node n-2 kind=service label="Order API" config={"replicas":3,"autoscaling":true} roles=[owns orders] ops=[command placeOrder idem (keyed by cart id); listOrders]',
    );
  });

  // A lens is asked which declared operations no edge exercises. It can only
  // answer about the names it was shown, so the schema's cap and the render's
  // must be one number — and an edge's `carries` is never elided either.
  it('prints every operation a node may declare, and never elides at the schema cap', () => {
    const line = renderNodeLine({
      id: 'n-1',
      kind: 'service',
      label: 'Orders',
      operations: Array.from({ length: NODE_MAX_OPERATIONS }, (_, i) => ({ name: `op${i}` })),
    });
    for (let i = 0; i < NODE_MAX_OPERATIONS; i++) expect(line).toContain(`op${i}`);
    expect(line).not.toContain('more]');
    // This assertion is the whole defence: inline either constant and the two
    // drift apart again, hiding declarations the lens is asked to judge.
    expect(MAX_SERIALIZED_OPS).toBe(NODE_MAX_OPERATIONS);
  });

  // The valve the schema no longer opens: kept so a future cap rise cannot
  // silently produce an unbounded line.
  it('still elides, and says how many, when fed past the cap the schema enforces', () => {
    const line = renderNodeLine({
      id: 'n-1',
      kind: 'service',
      label: 'Orders',
      operations: Array.from({ length: MAX_SERIALIZED_OPS + 2 }, (_, i) => ({ name: `op${i}` })),
    });
    expect(line).toContain('…+2 more');
  });

  it("stands a blank label in with its kind's own name, so no reader prints nothing", () => {
    expect(renderNodeLine({ id: 'n-1', kind: 'load-balancer', label: '' })).toBe(
      '  node n-1 kind=load-balancer label="Load Balancer"',
    );
    expect(renderNodeLine({ id: 'n-1', kind: 'database', label: '   ' })).toBe(
      '  node n-1 kind=database label="Database"',
    );
  });
});

describe('renderEdgeLine', () => {
  it('prints endpoints, kind, label and carries', () => {
    expect(
      renderEdgeLine({
        id: 'e-1',
        source: 'n-1',
        target: 'n-2',
        kind: 'async',
        label: 'publishes',
        carries: ['OrderPlaced'],
      }),
    ).toBe('  edge e-1: n-1 -> n-2 (async) label="publishes" carries=[OrderPlaced]');
  });
});
