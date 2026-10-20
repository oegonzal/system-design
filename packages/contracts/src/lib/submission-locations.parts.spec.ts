import { describe, expect, it } from 'vitest';

import type { DesignSubmission } from './canvas.schema';
import { submissionLocations } from './submission-locations';

/** A small submission with a drawn graph, one binding and a narrative, for numbering the parts added to it. */
const submission = (): DesignSubmission => ({
  graph: {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client' },
      { id: 'n-2', kind: 'service', label: 'Orders API' },
    ],
    edges: [{ id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' }],
  },
  brief: { version: 1, bindings: [{ criterionId: 'c1', nodeIds: ['n-2'], claim: 'held' }] },
  narrative: {
    version: 1,
    overview: 'One service in front of one store.',
    componentRationales: [{ nodeId: 'n-2', prose: 'Owns the orders.' }],
    criterionNarrations: [{ criterionId: 'c1', prose: 'The client asks the service.' }],
  },
});

describe('the parts a submission can carry beside its diagram, brief and narrative', () => {
  it('[UX-24] numbers the model’s entities after the edges, keyed by their ids, and the assumptions after the overview, keyed by nothing', () => {
    const base = submission();
    if (base.narrative === null) throw new Error('the fixture has a narrative');
    const located = submissionLocations({
      ...base,
      model: {
        version: 1,
        entities: [{ id: 'order', name: 'Order', fields: [], invariants: [], states: [] }],
        relations: [],
      },
      narrative: { ...base.narrative, assumptions: ['One shopper, one history.'] },
    });
    const ids = located.map((location) => location.id);
    expect(ids.indexOf('entity.1')).toBe(ids.lastIndexOf('edge.1') + 1);
    expect(ids.indexOf('assumption.1')).toBe(ids.indexOf('overview') + 1);
    expect(located.find((location) => location.id === 'entity.1')).toEqual({
      id: 'entity.1',
      label: 'Order entity (order)',
      part: 'entity',
      key: 'order',
      name: 'Order',
    });
    expect(located.find((location) => location.id === 'assumption.1')).toEqual({
      id: 'assumption.1',
      label: 'assumption: One shopper, one history.',
      part: 'assumption',
      key: null,
      name: null,
    });
  });

  it('[EVAL-2] numbers the narrative’s decisions after every other part, named by their choice and keyed by nothing', () => {
    const base = submission();
    if (base.narrative === null) throw new Error('the fixture has a narrative');
    const withDecisions: DesignSubmission = {
      ...base,
      narrative: {
        ...base.narrative,
        decisions: [
          { choice: 'Own a read model', alternative: 'Query both sources live', cost: 'Staleness' },
          { choice: 'One queue for both feeds' },
        ],
      },
    };
    const locations = submissionLocations(withDecisions);
    expect(locations.slice(-2)).toEqual([
      {
        id: 'decision.1',
        label: 'decision: Own a read model',
        part: 'decision',
        key: null,
        name: 'Own a read model',
      },
      {
        id: 'decision.2',
        label: 'decision: One queue for both feeds',
        part: 'decision',
        key: null,
        name: 'One queue for both feeds',
      },
    ]);
    expect(submissionLocations(base).some((location) => location.part === 'decision')).toBe(false);
  });
});
