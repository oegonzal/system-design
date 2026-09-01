import { describe, expect, it } from 'vitest';

import type { CanvasGraph, DesignBrief } from '@sysdesign/contracts';

import { validateBriefReferences, type BriefPromptRefs } from './brief-validator';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Client' },
    { id: 'n-2', kind: 'service', label: 'Service' },
    { id: 'n-3', kind: 'database', label: 'Database' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2' },
    { id: 'e-2', source: 'n-2', target: 'n-3' },
  ],
};

const prompt: BriefPromptRefs = {
  nonFunctionalRequirements: [{ id: 'fst-avail-sale-window' }, { id: 'fst-lat-read-spike' }],
  functionalRequirements: ['browse events', 'check out'],
};

const brief = (partial: Partial<DesignBrief> = {}): DesignBrief => ({
  version: 1,
  nfrBindings: [],
  flows: [],
  ...partial,
});

describe('validateBriefReferences', () => {
  it('accepts a brief whose every reference resolves', () => {
    const problems = validateBriefReferences(
      graph,
      brief({
        nfrBindings: [{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' }],
        flows: [{ id: 'f-1', requirementIndex: 0, path: ['e-1', 'e-2'] }],
      }),
      prompt,
    );
    expect(problems).toEqual([]);
  });

  it('rejects references the graph and prompt cannot resolve', () => {
    const problems = validateBriefReferences(
      graph,
      brief({
        nfrBindings: [{ nfrId: 'nope', nodeIds: ['n-9'], mechanism: 'backups' }],
        flows: [{ id: 'f-1', requirementIndex: 7, path: ['e-9'] }],
      }),
      prompt,
    );
    expect(problems).toContain('binding references unknown requirement: nope');
    expect(problems).toContain('binding references unknown node: n-9');
    expect(problems).toContain('flow f-1 references unknown edge: e-9');
    expect(problems.some((problem) => problem.includes('claims requirement #7'))).toBe(true);
  });

  it('rejects a mechanism the bound kind could never provide', () => {
    const problems = validateBriefReferences(
      graph,
      brief({ nfrBindings: [{ nfrId: 'fst-lat-read-spike', nodeIds: ['n-1'], mechanism: 'dlq' }] }),
      prompt,
    );
    expect(problems).toEqual(['a client cannot provide dlq (node n-1)']);
  });

  it('rejects a flow whose hops do not join up', () => {
    const problems = validateBriefReferences(
      graph,
      brief({ flows: [{ id: 'f-1', requirementIndex: 0, path: ['e-2', 'e-1'] }] }),
      prompt,
    );
    expect(problems).toEqual(['flow f-1 breaks at edge e-1 — it does not continue the path']);
  });

  it('rejects the same mechanism bound twice to one requirement', () => {
    const problems = validateBriefReferences(
      graph,
      brief({
        nfrBindings: [
          { nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' },
          { nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' },
        ],
      }),
      prompt,
    );
    expect(problems).toEqual(['duplicate binding of backups to requirement fst-avail-sale-window']);
  });

  it('says nothing about a claim the diagram simply fails to support', () => {
    // n-3 has no `backups` knob, so this binding is unsupported — that is a
    // grade the author must see as a finding, never a save blocker.
    const problems = validateBriefReferences(
      graph,
      brief({
        nfrBindings: [{ nfrId: 'fst-lat-read-spike', nodeIds: ['n-3'], mechanism: 'backups' }],
      }),
      prompt,
    );
    expect(problems).toEqual([]);
  });

  it('collects every problem in one pass rather than failing fast', () => {
    const problems = validateBriefReferences(
      graph,
      brief({
        nfrBindings: [{ nfrId: 'nope', nodeIds: ['n-9', 'n-1'], mechanism: 'dlq' }],
        flows: [{ id: 'f-1', requirementIndex: 0, path: [] }],
      }),
      prompt,
    );
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });
});
