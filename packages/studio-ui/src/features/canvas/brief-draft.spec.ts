import type { Binding, CanvasGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { accountedNodeIds, bindingState, nextHops, walkNodes } from './brief-draft';

/** client → gateway → service → database, plus a stray cache off the service. */
const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Buyer' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway', config: [{ key: 'rateLimit', value: true }] },
    { id: 'n-3', kind: 'service', label: 'Checkout' },
    { id: 'n-4', kind: 'database', label: 'Orders' },
    { id: 'n-5', kind: 'cache', label: 'Hot items' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    { id: 'e-3', source: 'n-3', target: 'n-4', kind: 'sync' },
    { id: 'e-4', source: 'n-3', target: 'n-5', kind: 'sync' },
  ],
};

const binding = (overrides: Partial<Binding> = {}): Binding => ({
  criterionId: 'c1',
  nodeIds: ['n-4'],
  path: ['e-1', 'e-2', 'e-3'],
  claim: 'Orders are read from the database',
  ...overrides,
});

describe('bindingState', () => {
  it('is bound only with both a claim and a component; anything less is incomplete', () => {
    expect(bindingState(null)).toBe('empty');
    expect(bindingState({ criterionId: 'c1', nodeIds: [], claim: '' })).toBe('empty');
    expect(bindingState({ criterionId: 'c1', nodeIds: [], claim: 'a cache' })).toBe('incomplete');
    expect(bindingState({ criterionId: 'c1', nodeIds: ['n-4'], claim: '  ' })).toBe('incomplete');
    expect(bindingState({ criterionId: 'c1', nodeIds: [], claim: '', path: ['e-1'] })).toBe(
      'incomplete',
    );
    expect(bindingState(binding())).toBe('bound');
  });
});

describe('nextHops', () => {
  it('offers every edge for the first hop and only connecting edges after', () => {
    expect(nextHops(graph, []).map((edge) => edge.id)).toEqual(['e-1', 'e-2', 'e-3', 'e-4']);
    // From e-1 (…→ n-2) only edges leaving n-2 continue the walk.
    expect(nextHops(graph, ['e-1']).map((edge) => edge.id)).toEqual(['e-2']);
    // n-3 branches, so both are legal continuations.
    expect(nextHops(graph, ['e-1', 'e-2']).map((edge) => edge.id)).toEqual(['e-3', 'e-4']);
  });

  it('offers nothing once the walk reaches a component with no outgoing edge', () => {
    expect(nextHops(graph, ['e-3'])).toEqual([]);
  });
});

describe('walkNodes', () => {
  it('reads the walk back as the components it passes through', () => {
    expect(walkNodes(graph, ['e-1', 'e-2', 'e-3']).map((node) => node.id)).toEqual([
      'n-1',
      'n-2',
      'n-3',
      'n-4',
    ]);
  });
});

describe('accountedNodeIds', () => {
  it('collects the components a binding names and the ones its path walks — from the draft', () => {
    // An incomplete binding (no claim yet) still accounts for what it names.
    const drafts = [binding({ nodeIds: ['n-5'], claim: '' })];
    expect([...accountedNodeIds(drafts, graph)].sort()).toEqual([
      'n-1',
      'n-2',
      'n-3',
      'n-4',
      'n-5',
    ]);
    expect(accountedNodeIds([], graph).size).toBe(0);
  });
});
