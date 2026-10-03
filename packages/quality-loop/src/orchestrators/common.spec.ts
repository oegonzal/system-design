import type { MemoryStoreAvailabilityDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { briefRoutes, refuseInternal, requestInput, storeReadiness } from './common';
import { summaryOf } from './runner/testing';

const registry = [
  summaryOf('tiny'),
  summaryOf('system-design-canvas', 80, 'composed'),
  summaryOf('memory-recall', 80, 'composed'),
];

describe('the pipelines a brief may go to', () => {
  it('[QL-24] routes only to pipelines that take a brief — a composed-goal pipeline is never offered', () => {
    expect(briefRoutes(registry)).toEqual([{ id: 'tiny', description: 'tiny grades' }]);
    expect(briefRoutes([])).toEqual([]);
  });

  it('[QL-24] refuses a composed-goal pipeline as a target, by its declaration, and nothing else', () => {
    expect(refuseInternal({ pipeline: 'system-design-canvas', goal: 'g' }, registry)).toMatch(
      /not a target: it takes a composed goal/,
    );
    expect(refuseInternal({ pipeline: 'memory-recall', goal: 'g' }, registry)).toMatch(
      /not a target/,
    );
    expect(refuseInternal({ pipeline: 'tiny', goal: 'g' }, registry)).toBeNull();
    // An unregistered id is the service's 404, which comes before any refusal.
    expect(refuseInternal({ pipeline: 'nowhere', goal: 'g' }, registry)).toBeNull();
    expect(refuseInternal({ goal: 'g' }, registry)).toBeNull();
  });

  // The reason is about composing a goal for a run about to start. A stood-in
  // target never runs, so a finished run of a composed-goal pipeline is still a
  // run the digest and store steps can read — which is how the studio's own
  // runs reach the memory store.
  it('[QL-24] says nothing about a target that stands in: a finished composed-goal run is still digestible', () => {
    for (const pipeline of ['system-design-canvas', 'memory-recall', 'tiny']) {
      expect(refuseInternal({ pipeline, goal: 'g' }, registry, true)).toBeNull();
    }
    // …and the default is unchanged, so starting one is still refused.
    expect(
      refuseInternal({ pipeline: 'system-design-canvas', goal: 'g' }, registry, false),
    ).toMatch(/not a target/);
  });
});

describe('the run inputs a request carries', () => {
  it('[QL-38] forwards a supplied rubric with the goal and the budget, so an orchestration’s runs cite the caller’s ids', () => {
    const criteria = [{ id: 'c1', kind: 'grounding', statement: 'Every value rests on evidence.' }];
    expect(requestInput({ goal: 'g', maxIterations: 1, criteria })).toEqual({
      goal: 'g',
      output: undefined,
      maxIterations: 1,
      criteria,
    });
    expect(requestInput({ goal: 'g' }, 'g with evidence')).toEqual({
      goal: 'g with evidence',
      output: undefined,
      maxIterations: undefined,
      criteria: undefined,
    });
  });
});

describe('whether the memory store can be searched', () => {
  const ready: MemoryStoreAvailabilityDto = {
    ready: true,
    reason: null,
    note: null,
    model: 'm',
    collection: 'c',
    chunks: 3,
  };
  const on = {
    embedding: { enabled: true, model: 'm', reason: null },
    embeddings: { enabled: true },
  };

  it('[QL-38] says why not in the closed words both recalls declare, embeddings first, then the store, then its emptiness', () => {
    expect(
      storeReadiness(
        {
          embedding: { enabled: false, model: null, reason: 'no-key' },
          embeddings: { enabled: false },
        },
        ready,
      ),
    ).toEqual({ reason: 'embeddings-disabled', note: 'no-key' });
    expect(
      storeReadiness(on, { ...ready, ready: false, reason: 'unreachable', note: 'down' }),
    ).toEqual({ reason: 'store-unavailable', note: 'down' });
    expect(storeReadiness(on, { ...ready, ready: false, reason: 'no-model', model: null })).toEqual(
      { reason: 'store-unavailable', note: 'no-model' },
    );
    expect(storeReadiness(on, { ...ready, chunks: 0 })).toEqual({
      reason: 'store-empty',
      note: null,
    });
    expect(storeReadiness(on, ready)).toBeNull();
  });
});
