import { describe, expect, it } from 'vitest';

import type { DesignSubmission } from './canvas.schema';
import { submissionLocations } from './submission-locations';

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
      { id: 'binding.1', label: 'c1 ← n-2', part: 'binding', key: 'c1' },
      // Numbered unfiltered: a binding the validator would refuse keeps its position.
      { id: 'binding.2', label: 'c99 ← n-1', part: 'binding', key: 'c99' },
      { id: 'overview', label: 'Overview', part: 'overview', key: null },
      { id: 'rationale.1', label: 'n-2', part: 'rationale', key: 'n-2' },
      { id: 'narration.1', label: 'c1', part: 'narration', key: 'c1' },
    ]);
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
