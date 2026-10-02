import { describe, expect, it } from 'vitest';

import {
  makeEscalatedRun,
  makeOrchestration,
  makeTwoIterationRun,
} from '../../../testing/fixtures';
import type { InspectorAction } from './action';
import { deriveOrchestration } from './derive-orchestration';
import { deriveRun } from './derive-run';
import { HASH_PROBES, identityOf, isOpaquePath, objectHash, OPAQUE_PATHS } from './object-hash';
import { reduce } from './reduce';
import { emptyState, type InspectorState } from './state';

/** Every state one action sequence passes through, not only the one it ends at. */
const walkStates = (actions: readonly InspectorAction[]): InspectorState[] => {
  const seen: InspectorState[] = [];
  let state = emptyState();
  for (const action of actions) {
    state = reduce(state, action);
    seen.push(state);
  }
  return seen;
};

/**
 * Every state the fixtures can reach. Intermediate states matter as much as
 * final ones: the two-iteration run ends with no confirmed findings, so a walk
 * over end states alone would never test the array that holds them.
 */
const states = (): InspectorState[] => {
  const run = makeTwoIterationRun();
  return [
    ...walkStates(deriveRun(run)),
    ...walkStates(deriveRun(makeEscalatedRun())),
    ...walkStates(deriveOrchestration(makeOrchestration(), { children: { [run.runId]: run } })),
  ];
};

interface FoundArray {
  path: string[];
  items: unknown[];
}

/** Every array at every depth of a value, with the path it was found at. */
function arraysIn(value: unknown, path: string[] = [], found: FoundArray[] = []): FoundArray[] {
  if (Array.isArray(value)) {
    found.push({ path, items: value });
    value.forEach((item, index) => arraysIn(item, [...path, String(index)], found));
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) arraysIn(child, [...path, key], found);
  }
  return found;
}

const primitive = (value: unknown): boolean => value === null || typeof value !== 'object';

describe('identifying an array element across two states', () => {
  it('[QLU-7] every array the loop’s own shapes reach is identified, and identified uniquely', () => {
    const checked: string[] = [];
    for (const state of states()) {
      for (const { path, items } of arraysIn(state)) {
        if (isOpaquePath(path)) continue;
        if (items.every(primitive)) continue;
        const identities = items.map((item) => identityOf(item));
        // Defined: a shape the probe table knows. Unique: two elements of one
        // array can never be mistaken for each other.
        expect(identities, `at ${path.join('.')}`).not.toContain(undefined);
        expect(new Set(identities).size, `at ${path.join('.')}`).toBe(items.length);
        checked.push(path.join('.'));
      }
    }
    // The walk has to actually reach the interesting arrays, or it proves nothing.
    expect(checked).toContain('ledger.criteria');
    expect(checked).toContain('ledger.findings');
    expect(checked).toContain('contract.criteria');
    expect(checked).toContain('decision.trace.steps');
    expect(checked).toContain('decision.trace.dimensions');
    expect(checked).toContain('exchanges');
    expect(checked.length).toBeGreaterThan(10);
  });

  it('[QLU-7] the shapes this client is not allowed to know are declared, and fall back to position', () => {
    // A pipeline's artifact and an orchestrator's report are the two. Giving
    // either a domain identity would mean the UI learning another layer's
    // vocabulary, which the engine's rules forbid.
    expect(OPAQUE_PATHS).toEqual([
      'artifact.value',
      'orchestration.context',
      'orchestration.steps.*.report',
    ]);
    expect(isOpaquePath(['orchestration', 'steps', 'reconcile', 'report', 'contested'])).toBe(true);
    expect(isOpaquePath(['orchestration', 'steps', 'reconcile', 'counts'])).toBe(false);

    // The library treats an undefined hash as matching nothing at all, so the
    // position fallback lives inside the hash rather than in its own option.
    const unknown = { whatever: 1 };
    expect(identityOf(unknown)).toBeUndefined();
    expect(objectHash(unknown, 3)).toBe('@3');
    expect(objectHash(unknown, 3)).toBe(objectHash({ whatever: 2 }, 3));
    expect(objectHash(unknown, 3)).not.toBe(objectHash(unknown, 4));
  });

  it('[QLU-7] the more specific shapes are probed before the ones they share a field with', () => {
    const order = HASH_PROBES.map((probe) => probe.shape);
    const before = (a: string, b: string) =>
      order.findIndex((shape) => shape.includes(a)) < order.findIndex((shape) => shape.includes(b));
    // All three carry `key`; probed in the wrong order, every penalty would be
    // identified as the finding it priced.
    expect(before('PenaltyTrace', 'ConfirmedFinding')).toBe(true);
    expect(before('DiscardedItem', 'ConfirmedFinding')).toBe(true);
    expect(before('DecisionStep', 'ControllerSummary')).toBe(true);

    expect(identityOf({ key: 'f|x', position: 0 })).toBe('penalty:f|x#0');
    expect(identityOf({ lens: 'critic.a', key: 'f|x', reason: 'below-min-hits' })).toBe(
      'discarded:critic.a|f|x',
    );
    expect(identityOf({ key: 'f|x', type: 'f' })).toBe('finding:f|x');
    // A finding is the same defect wherever its locations are listed.
    expect(identityOf({ type: 'gap', severity: 'low', locationRefs: ['b', 'a'] })).toBe(
      identityOf({ type: 'gap', severity: 'high', locationRefs: ['a', 'b'] }),
    );
  });

  it('[QLU-7] an array is never given an element identity', () => {
    expect(identityOf([1, 2])).toBeUndefined();
    expect(identityOf(null)).toBeUndefined();
    expect(identityOf('text')).toBeUndefined();
  });
});
