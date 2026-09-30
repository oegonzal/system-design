import type { Binding, CanvasGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../testing/fixtures';
import { accountedNodeIds, bindingState, nextHops, reconcileBrief, walkNodes } from './brief-draft';

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

const criteria = makeCriteria();

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

/**
 * The API rejects an impossible brief and the loop grades an unsupported one.
 * These pin the first half: every shape the server would 422 is dropped here
 * before it can be sent, and none of it is dropped for being merely unproven.
 */
describe('reconcileBrief', () => {
  it('emits the draft unchanged when the canvas and the rubric still support it', () => {
    expect(reconcileBrief([binding()], graph, criteria)).toEqual({
      version: 1,
      bindings: [binding()],
    });
  });

  it('keeps an unsupported claim — that claim is the lesson, not an error', () => {
    // A client cannot hold a latency target. The lenses will say so; the
    // editor must not silently delete it.
    const unproven = binding({ criterionId: 'c3', nodeIds: ['n-1'], path: undefined });
    expect(reconcileBrief([unproven], graph, criteria)?.bindings).toEqual([unproven]);
  });

  it('drops a binding whose criterion the prompt never derived', () => {
    expect(reconcileBrief([binding({ criterionId: 'c99' })], graph, criteria)).toBeNull();
  });

  it('drops a binding with no claim, and trims and clips the one it keeps', () => {
    expect(reconcileBrief([binding({ claim: '   ' })], graph, criteria)).toBeNull();
    const long = 'x'.repeat(400);
    expect(
      reconcileBrief([binding({ claim: `  ${long}  ` })], graph, criteria)?.bindings[0].claim,
    ).toHaveLength(200);
  });

  it('drops a node the canvas no longer has, and the binding if none survive', () => {
    expect(
      reconcileBrief([binding({ nodeIds: ['n-4', 'n-deleted'] })], graph, criteria)?.bindings,
    ).toEqual([binding({ nodeIds: ['n-4'] })]);
    expect(reconcileBrief([binding({ nodeIds: ['n-deleted'] })], graph, criteria)).toBeNull();
  });

  it('deduplicates node ids, which the API rejects but a checkbox cannot produce twice', () => {
    expect(
      reconcileBrief([binding({ nodeIds: ['n-4', 'n-4'] })], graph, criteria)?.bindings,
    ).toEqual([binding({ nodeIds: ['n-4'] })]);
  });

  it('keeps the first binding per criterion so a duplicate is unreachable', () => {
    const second = binding({ claim: 'a later duplicate' });
    expect(reconcileBrief([binding(), second], graph, criteria)?.bindings).toEqual([binding()]);
  });

  it('truncates a path at the first hop that no longer connects', () => {
    // e-4 leaves n-3, so it cannot follow e-3 which arrives at n-4.
    const broken = binding({ path: ['e-1', 'e-2', 'e-3', 'e-4'] });
    expect(reconcileBrief([broken], graph, criteria)?.bindings).toEqual([
      binding({ path: ['e-1', 'e-2', 'e-3'] }),
    ]);
  });

  it('truncates a path at an edge the canvas no longer has, and omits an emptied path', () => {
    expect(
      reconcileBrief([binding({ path: ['e-1', 'e-gone'] })], graph, criteria)?.bindings,
    ).toEqual([binding({ path: ['e-1'] })]);
    const kept = reconcileBrief([binding({ path: ['e-gone'] })], graph, criteria)?.bindings[0];
    expect(kept).toEqual(binding({ path: undefined }));
    expect(kept).not.toHaveProperty('path');
  });

  /**
   * An empty brief is accepted by the API but reads exactly like silence,
   * while leaving a stored artifact that implies otherwise.
   */
  it('is null when nothing is claimed, so submit sends no brief at all', () => {
    expect(reconcileBrief([], graph, criteria)).toBeNull();
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
