import { describe, expect, it } from 'vitest';

import { validateBriefReferences } from './brief-validator';
import type { CanvasGraph, DesignBrief } from './canvas.schema';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: '' },
    { id: 'n-2', kind: 'service', label: '' },
    { id: 'n-3', kind: 'database', label: '' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
  ],
};
const criteria = [{ id: 'c1' }, { id: 'c2' }];
const brief = (bindings: DesignBrief['bindings']): DesignBrief => ({ version: 1, bindings });

describe('validateBriefReferences', () => {
  it('[DEL-5] accepts a binding to known criteria and nodes with a connected path', () => {
    expect(
      validateBriefReferences(
        graph,
        brief([
          {
            criterionId: 'c1',
            nodeIds: ['n-2', 'n-3'],
            path: ['e-1', 'e-2'],
            claim: 'the API writes',
          },
        ]),
        criteria,
      ),
    ).toEqual([]);
  });

  it('[DEL-5] rejects only the impossible: an unknown criterion, a second binding of one criterion, unknown or repeated nodes', () => {
    const problems = validateBriefReferences(
      graph,
      brief([
        { criterionId: 'c9', nodeIds: ['n-2'], claim: 'x' },
        { criterionId: 'c1', nodeIds: ['n-2', 'n-2', 'ghost'], claim: 'x' },
        { criterionId: 'c1', nodeIds: ['n-3'], claim: 'y' },
      ]),
      criteria,
    );
    expect(problems).toEqual([
      'binding references unknown criterion: c9',
      'binding of c1 lists node n-2 twice',
      'binding of c1 references unknown node: ghost',
      'criterion c1 is bound twice',
    ]);
  });

  it('rejects a path that names an edge not on the canvas or does not continue the walk', () => {
    const problems = validateBriefReferences(
      graph,
      brief([{ criterionId: 'c2', nodeIds: ['n-2'], path: ['e-2', 'e-1', 'e-9'], claim: 'x' }]),
      criteria,
    );
    expect(problems).toEqual([
      'path of c2 breaks at edge e-1 — it does not continue the walk',
      'path of c2 references unknown edge: e-9',
    ]);
  });

  it('says nothing about a claim the design merely fails to back', () => {
    // A client "holding" a criterion is a bad answer, not an impossible one.
    expect(
      validateBriefReferences(
        graph,
        brief([{ criterionId: 'c1', nodeIds: ['n-1'], claim: 'the browser caches it' }]),
        criteria,
      ),
    ).toEqual([]);
  });
});
