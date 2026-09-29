import { describe, expect, it } from 'vitest';

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

  it('elides operations past the per-line budget and says how many', () => {
    const line = renderNodeLine({
      id: 'n-1',
      kind: 'service',
      label: '',
      operations: Array.from({ length: MAX_SERIALIZED_OPS + 2 }, (_, i) => ({ name: `op${i}` })),
    });
    expect(line).toContain('…+2 more');
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
