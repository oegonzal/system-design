import { describe, expect, it } from 'vitest';

import type { DesignSubmission } from './canvas.schema';
import {
  locationIdsIn,
  shortLocationLabel,
  submissionLocations,
  substituteLocationRefs,
  type LocatedRef,
} from './submission-locations';

const submission = (): DesignSubmission => ({
  graph: {
    nodes: [
      { id: 'n-1', kind: 'client', label: 'Client' },
      { id: 'n-2', kind: 'service', label: 'Orders API' },
    ],
    edges: [{ id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' }],
  },
  brief: {
    version: 1,
    bindings: [
      { criterionId: 'c1', nodeIds: ['n-2'], path: ['e-1'], claim: 'served by the API' },
      { criterionId: 'c99', nodeIds: ['n-1'], claim: 'a binding the rubric never listed' },
    ],
  },
  narrative: {
    version: 1,
    overview: 'One service in front of one store.',
    componentRationales: [{ nodeId: 'n-2', prose: 'It owns the order lifecycle.' }],
    criterionNarrations: [{ criterionId: 'c1', prose: 'A read hits the API.' }],
  },
});

describe('submissionLocations', () => {
  it('[EVAL-2] locates every part positionally with its label, part and the author’s own key', () => {
    expect(submissionLocations(submission())).toEqual([
      { id: 'node.1', label: 'n-1 · client · Client', part: 'node', key: 'n-1', name: 'Client' },
      {
        id: 'node.2',
        label: 'n-2 · service · Orders API',
        part: 'node',
        key: 'n-2',
        name: 'Orders API',
      },
      { id: 'edge.1', label: 'e-1 · n-1 → n-2 (sync)', part: 'edge', key: 'e-1', name: null },
      { id: 'binding.1', label: 'c1 binding (n-2)', part: 'binding', key: 'c1', name: null },
      // Numbered unfiltered: a binding the validator would refuse keeps its position.
      { id: 'binding.2', label: 'c99 binding (n-1)', part: 'binding', key: 'c99', name: null },
      { id: 'overview', label: 'Overview', part: 'overview', key: null, name: null },
      {
        id: 'rationale.1',
        label: 'Orders API rationale (n-2)',
        part: 'rationale',
        key: 'n-2',
        name: null,
      },
      { id: 'narration.1', label: 'c1 narration', part: 'narration', key: 'c1', name: null },
    ]);
  });

  // A reader meets these labels substituted into a lens's prose, so each one
  // names its part: a bare `c1` reads as the criterion, a bare `n-2` as the node.
  it('[EVAL-2] labels the brief and the narrative by what they are, never by a bare id', () => {
    const located = submissionLocations({
      ...submission(),
      narrative: {
        version: 1,
        componentRationales: [{ nodeId: 'ghost', prose: 'explains a node no longer drawn' }],
        criterionNarrations: [],
      },
    });
    const labelOf = (id: string) => located.find((location) => location.id === id)?.label;
    expect(labelOf('rationale.1')).toBe('ghost rationale');
    expect(labelOf('binding.1')).toBe('c1 binding (n-2)');
    for (const location of located) {
      if (location.key === null || location.part === 'node' || location.part === 'edge') continue;
      expect(location.label).not.toBe(location.key);
    }
  });

  // The label is substituted into finding prose by the studio, so a blank one
  // would surface mid-sentence as a dangling separator.
  it("labels a blank-labelled node by its kind's own name, never with a trailing separator", () => {
    const blank = submission();
    blank.graph.nodes = [{ id: 'n-1', kind: 'kv-store', label: '' }];
    expect(submissionLocations(blank)[0]).toEqual({
      id: 'node.1',
      label: 'n-1 · kv-store · KV Store',
      part: 'node',
      key: 'n-1',
      name: 'KV Store',
    });
  });

  it('has no overview entry for a blank overview, and only nodes and edges without a brief or narrative', () => {
    const blank = submission();
    blank.narrative = { ...blank.narrative!, overview: '   ' };
    expect(submissionLocations(blank).map((location) => location.id)).not.toContain('overview');

    expect(
      submissionLocations({ ...submission(), brief: null, narrative: null }).map((l) => l.id),
    ).toEqual(['node.1', 'node.2', 'edge.1']);
  });
});

describe('locationIdsIn', () => {
  const located = submissionLocations(submission());

  it('[EVAL-2] finds the ids the prose names among the ones the submission has, in order, once each', () => {
    expect(
      locationIdsIn(
        'narration.1 says so, but edge.1 carries nothing node.2 serves; edge.1 again, and node.9 is no part',
        located,
      ),
    ).toEqual(['narration.1', 'edge.1', 'node.2']);
  });

  it('[EVAL-2] answers an id as listed however the sentence cased it, and a run by every member', () => {
    expect(locationIdsIn('Narration.1 claims what Node.1-2 cannot do', located)).toEqual([
      'narration.1',
      'node.1',
      'node.2',
    ]);
    expect(locationIdsIn('anything', [])).toEqual([]);
  });
});

describe('substituteLocationRefs', () => {
  const refs: LocatedRef[] = [
    { ref: 'node.1', label: 'n-1 · client · Client', part: 'node', key: 'n-1', name: 'Client' },
    {
      ref: 'node.5',
      label: 'n-5 · database · Orders DB',
      part: 'node',
      key: 'n-5',
      name: 'Orders DB',
    },
    { ref: 'edge.1', label: 'e-1 · n-1 → n-5 (sync)', part: 'edge', key: 'e-1' },
    { ref: 'edge.2', label: 'e-2 · n-5 → n-4 (sync)', part: 'edge', key: 'e-2' },
    { ref: 'binding.1', label: 'c1 binding (n-5)', part: 'binding', key: 'c1' },
    { ref: 'rationale.3', label: 'Client rationale (n-1)', part: 'rationale', key: 'n-1' },
    { ref: 'narration.1', label: 'c5 narration', part: 'narration', key: 'c5' },
    { ref: 'overview', label: 'Overview', part: 'overview', key: null },
  ];

  it('[EVAL-2] puts a label where a lens wrote a position, however the sentence cased it', () => {
    expect(
      substituteLocationRefs('Rationale.3 asserts polling; Narration.1 claims multi-AZ.', refs),
    ).toBe('Client rationale (n-1) asserts polling; c5 narration claims multi-AZ.');
    expect(substituteLocationRefs('node.9 and nodeX1 are no part', refs)).toBe(
      'node.9 and nodeX1 are no part',
    );
  });

  // The recorded artifact: "edge.1-2" became "e-1 · n-1 → n-5 (sync)-2".
  it('[EVAL-2] reads a run of refs as its two ends, never as one label with a number left over', () => {
    expect(substituteLocationRefs('the unexplained gateway (edge.1-2, node.5)', refs)).toBe(
      'the unexplained gateway (e-1 · n-1 → n-5 (sync) to e-2 · n-5 → n-4 (sync), n-5 · database · Orders DB)',
    );
  });

  // "Orders DB (n-5 · database · Orders DB) models no such sub-entities".
  it('[EVAL-2] gives the short label where the sentence names the part beside the ref, and on every later mention', () => {
    expect(substituteLocationRefs('Orders DB (node.5) models no such sub-entities', refs)).toBe(
      'Orders DB (n-5) models no such sub-entities',
    );
    expect(substituteLocationRefs('node.5 — Orders DB — holds no shard key', refs)).toBe(
      'n-5 — Orders DB — holds no shard key',
    );
    // Named elsewhere in the sentence is not beside it: the full label stands.
    expect(substituteLocationRefs('the client polls node.1 for seats', refs)).toBe(
      'the client polls n-1 · client · Client for seats',
    );
    expect(substituteLocationRefs('no shard config in node.5; node.5 is unsharded', refs)).toBe(
      'no shard config in n-5 · database · Orders DB; n-5 is unsharded',
    );
  });

  it('every part has a short label, built from its key and what it is', () => {
    expect(refs.map(shortLocationLabel)).toEqual([
      'n-1',
      'n-5',
      'e-1',
      'e-2',
      'c1 binding',
      'n-1 rationale',
      'c5 narration',
      'Overview',
    ]);
  });
});
