import { describe, expect, it } from 'vitest';

import { reconcileBrief, validPrefix } from './brief-repair';
import type { CriterionRef } from './brief-validator';
import { BINDING_CLAIM_MAX_LENGTH } from './canvas';
import type { Binding, CanvasGraph } from './canvas.schema';

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

const criteria: CriterionRef[] = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({ id }));

const binding = (overrides: Partial<Binding> = {}): Binding => ({
  criterionId: 'c1',
  nodeIds: ['n-4'],
  path: ['e-1', 'e-2', 'e-3'],
  claim: 'Orders are read from the database',
  ...overrides,
});

describe('validPrefix', () => {
  it('keeps the walk up to the first edge that is missing or does not continue it', () => {
    expect(validPrefix(graph, ['e-1', 'e-2', 'e-3'])).toEqual(['e-1', 'e-2', 'e-3']);
    expect(validPrefix(graph, ['e-1', 'e-9'])).toEqual(['e-1']);
    // e-4 leaves n-3, so it cannot follow e-3 which arrives at n-4.
    expect(validPrefix(graph, ['e-1', 'e-2', 'e-3', 'e-4'])).toEqual(['e-1', 'e-2', 'e-3']);
    expect(validPrefix(graph, ['e-9'])).toEqual([]);
  });
});

/**
 * The validator refuses an impossible brief and the loop grades an
 * unsupported one. These pin the first half: every shape the validator would
 * refuse is dropped here, and none of it is dropped for being merely unproven.
 */
describe('reconcileBrief', () => {
  it('emits the bindings unchanged when the canvas and the rubric still support them', () => {
    expect(reconcileBrief([binding()], graph, criteria)).toEqual({
      version: 1,
      bindings: [binding()],
    });
  });

  it('keeps an unsupported claim — that claim is the lesson, not an error', () => {
    // A client cannot hold a latency target. The lenses will say so; the
    // repair must not silently delete it.
    const unproven = binding({ criterionId: 'c3', nodeIds: ['n-1'], path: undefined });
    expect(reconcileBrief([unproven], graph, criteria)?.bindings).toEqual([unproven]);
  });

  it('drops a binding whose criterion the rubric never listed', () => {
    expect(reconcileBrief([binding({ criterionId: 'c99' })], graph, criteria)).toBeNull();
  });

  it('drops a binding with no claim, and trims the one it keeps — never cuts it to fit', () => {
    expect(reconcileBrief([binding({ claim: '   ' })], graph, criteria)).toBeNull();
    const long = 'x'.repeat(BINDING_CLAIM_MAX_LENGTH + 100);
    expect(
      reconcileBrief([binding({ claim: `  ${long}  ` })], graph, criteria)?.bindings[0].claim,
    ).toBe(long);
  });

  it('drops a node the canvas no longer has, and the binding if none survive', () => {
    expect(
      reconcileBrief([binding({ nodeIds: ['n-4', 'n-deleted'] })], graph, criteria)?.bindings,
    ).toEqual([binding({ nodeIds: ['n-4'] })]);
    expect(reconcileBrief([binding({ nodeIds: ['n-deleted'] })], graph, criteria)).toBeNull();
  });

  it('deduplicates node ids, which the validator refuses', () => {
    expect(
      reconcileBrief([binding({ nodeIds: ['n-4', 'n-4'] })], graph, criteria)?.bindings,
    ).toEqual([binding({ nodeIds: ['n-4'] })]);
  });

  it('keeps the first binding per criterion so a duplicate is unreachable', () => {
    const second = binding({ claim: 'a later duplicate' });
    expect(reconcileBrief([binding(), second], graph, criteria)?.bindings).toEqual([binding()]);
  });

  it('truncates a path at the first hop that no longer connects', () => {
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

  it('is null when nothing is claimed, so nothing implies the author bound nothing', () => {
    expect(reconcileBrief([], graph, criteria)).toBeNull();
  });
});
