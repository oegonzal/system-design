import { describe, expect, it } from 'vitest';

import type { DesignSubmission } from './canvas.schema';
import { locationIdsIn, locationRefPattern, submissionLocations } from './submission-locations';

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
      { id: 'node.1', label: 'n-1 · client · Client', part: 'node', key: 'n-1' },
      { id: 'node.2', label: 'n-2 · service · Orders API', part: 'node', key: 'n-2' },
      { id: 'edge.1', label: 'e-1 · n-1 → n-2 (sync)', part: 'edge', key: 'e-1' },
      { id: 'binding.1', label: 'c1 binding (n-2)', part: 'binding', key: 'c1' },
      // Numbered unfiltered: a binding the validator would refuse keeps its position.
      { id: 'binding.2', label: 'c99 binding (n-1)', part: 'binding', key: 'c99' },
      { id: 'overview', label: 'Overview', part: 'overview', key: null },
      { id: 'rationale.1', label: 'Orders API rationale (n-2)', part: 'rationale', key: 'n-2' },
      { id: 'narration.1', label: 'c1 narration', part: 'narration', key: 'c1' },
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

  it('matches whole ids only — `node.1` never inside `node.12` or `xnode.1`', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ id: `node.${index + 1}` }));
    expect(locationIdsIn('node.12 then node.1, never xnode.1 or node.1a', many)).toEqual([
      'node.12',
      'node.1',
    ]);
    expect(locationIdsIn('anything', [])).toEqual([]);
    expect(locationRefPattern([])).toBeNull();
  });
});
