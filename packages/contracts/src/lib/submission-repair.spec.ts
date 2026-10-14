import { describe, expect, it } from 'vitest';

import { validateBriefReferences, type CriterionRef } from './brief-validator';
import type { DesignSubmission } from './canvas.schema';
import { validateNarration } from './narration-validator';
import { repairSubmission } from './submission-repair';

const criteria: CriterionRef[] = ['c1', 'c2', 'c3'].map((id) => ({ id }));

/** The brief and the narrative the valid submission carries, each its own fresh copy. */
const briefOf = (): NonNullable<DesignSubmission['brief']> => ({
  version: 1,
  bindings: [{ criterionId: 'c1', nodeIds: ['n-2', 'n-3'], path: ['e-1', 'e-2'], claim: 'ok' }],
});
const narrativeOf = (): NonNullable<DesignSubmission['narrative']> => ({
  version: 1,
  overview: 'A thin API over one store.',
  componentRationales: [{ nodeId: 'n-3', prose: 'The system of record.' }],
  criterionNarrations: [{ criterionId: 'c1', prose: 'A read walks e-1 then e-2.' }],
});

const valid = (): DesignSubmission => ({
  graph: {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client' },
      { id: 'n-2', kind: 'service', label: 'API' },
      { id: 'n-3', kind: 'database', label: 'Orders' },
    ],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
      { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    ],
  },
  brief: briefOf(),
  narrative: narrativeOf(),
});

/** What a repair is expected to have kept, or a failure that says it kept none. */
const kept = <T>(value: T | null, what: string): T => {
  if (value === null) throw new Error(`the repair kept no ${what}`);
  return value;
};

/** What a coach might return: a rubric id it invented, a duplicate, a fan-out path, a ghost node. */
const sloppy = (): DesignSubmission => {
  const base = valid();
  return {
    graph: base.graph,
    brief: {
      version: 1,
      bindings: [
        ...briefOf().bindings,
        { criterionId: 'c99', nodeIds: ['n-2'], claim: 'no such criterion' },
        { criterionId: 'c1', nodeIds: ['n-1'], claim: 'bound twice' },
        // e-2 does not start where e-1 starts: a fan-out, not a walk.
        {
          criterionId: 'c2',
          nodeIds: ['n-2', 'n-ghost'],
          path: ['e-1', 'e-2', 'e-1'],
          claim: 'fan',
        },
      ],
    },
    narrative: {
      version: 1,
      overview: narrativeOf().overview,
      componentRationales: [
        ...narrativeOf().componentRationales,
        { nodeId: 'n-ghost', prose: 'explains a node that is not drawn' },
      ],
      criterionNarrations: [
        ...narrativeOf().criterionNarrations,
        { criterionId: 'c42', prose: 'narrates a criterion the rubric never listed' },
      ],
    },
  };
};

describe('repairSubmission', () => {
  it('[UX-11] is the identity on a submission the validators already accept', () => {
    expect(repairSubmission(valid(), criteria)).toEqual(valid());
  });

  it('[UX-11] drops what the rubric or canvas no longer supports and leaves the graph untouched', () => {
    const input = sloppy();
    const repaired = repairSubmission(input, criteria);
    expect(repaired.graph).toBe(input.graph);
    expect(repaired.brief?.bindings).toEqual([
      briefOf().bindings[0],
      { criterionId: 'c2', nodeIds: ['n-2'], path: ['e-1', 'e-2'], claim: 'fan' },
    ]);
    expect(repaired.narrative).toEqual(valid().narrative);
    expect(
      validateBriefReferences(repaired.graph, kept(repaired.brief, 'brief'), criteria),
    ).toEqual([]);
    expect(
      validateNarration(repaired.graph, kept(repaired.narrative, 'narrative'), criteria),
    ).toEqual([]);
  });

  it('[UX-11] is idempotent, and turns an emptied brief or narrative into null', () => {
    const once = repairSubmission(sloppy(), criteria);
    expect(repairSubmission(once, criteria)).toEqual(once);

    const emptied = repairSubmission(
      {
        graph: valid().graph,
        brief: { version: 1, bindings: [{ criterionId: 'c99', nodeIds: ['n-1'], claim: 'x' }] },
        narrative: { version: 1, componentRationales: [], criterionNarrations: [] },
      },
      criteria,
    );
    expect(emptied).toEqual({ graph: valid().graph, brief: null, narrative: null });
  });
});
