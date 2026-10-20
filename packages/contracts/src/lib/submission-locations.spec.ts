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
    const blank: DesignSubmission = {
      ...submission(),
      narrative: { version: 1, overview: '   ', componentRationales: [], criterionNarrations: [] },
    };
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
    {
      ref: 'decision.1',
      label: 'decision: Own a read model',
      part: 'decision',
      key: null,
      name: 'Own a read model',
    },
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
      'the unexplained gateway (e-1 to e-2, n-5)',
    );
  });

  // "Orders DB (n-5 · database · Orders DB) models no such sub-entities".
  it('[EVAL-2] gives the short label wherever the sentence already says the part’s name, and on every later mention', () => {
    expect(substituteLocationRefs('Orders DB (node.5) models no such sub-entities', refs)).toBe(
      'Orders DB (n-5) models no such sub-entities',
    );
    expect(substituteLocationRefs('node.5 — Orders DB — holds no shard key', refs)).toBe(
      'n-5 — Orders DB — holds no shard key',
    );
    // The name said anywhere in the sentence, not only beside the ref: a rule over the words.
    expect(substituteLocationRefs('the Orders DB at node.5 has no shard key', refs)).toBe(
      'the Orders DB at n-5 has no shard key',
    );
    expect(substituteLocationRefs('node.5 (the Orders DB) has no shard key', refs)).toBe(
      'n-5 (the Orders DB) has no shard key',
    );
    expect(substituteLocationRefs('The Orders DB primary (node.5) is unsharded', refs)).toBe(
      'The Orders DB primary (n-5) is unsharded',
    );
    expect(substituteLocationRefs('the client polls node.1 for seats', refs)).toBe(
      'the client polls n-1 for seats',
    );
    // Said by no word of the sentence: the full label stands, once.
    expect(substituteLocationRefs('no shard config in node.5; node.5 is unsharded', refs)).toBe(
      'no shard config in n-5 · database · Orders DB; n-5 is unsharded',
    );
    // A part with no name of its own is introduced in full, whatever the sentence says.
    expect(substituteLocationRefs('the c1 binding (binding.1) is wrong', refs)).toBe(
      'the c1 binding (c1 binding (n-5)) is wrong',
    );
  });

  // "The Orders DB (node.5) writes to node.7 and node.8." read "… writes to
  // n-7 and n-8": the Orders DB's name was counted for a "DB" and an "Orders".
  it('[EVAL-2] counts a name said once for one part, never again for a part whose name is inside it', () => {
    const nested: LocatedRef[] = [
      {
        ref: 'node.5',
        label: 'n-5 · database · Orders DB',
        part: 'node',
        key: 'n-5',
        name: 'Orders DB',
      },
      { ref: 'node.7', label: 'n-7 · database · DB', part: 'node', key: 'n-7', name: 'DB' },
      { ref: 'node.8', label: 'n-8 · service · Orders', part: 'node', key: 'n-8', name: 'Orders' },
      { ref: 'node.9', label: 'n-9 · database · DB', part: 'node', key: 'n-9', name: 'DB' },
    ];
    expect(
      substituteLocationRefs('The Orders DB (node.5) writes to node.7 and node.8.', nested),
    ).toBe('The Orders DB (n-5) writes to n-7 · database · DB and n-8 · service · Orders.');
    expect(
      substituteLocationRefs(
        'Orders (node.8) reads the DB (node.7) beside the Orders DB (node.5)',
        nested,
      ),
    ).toBe('Orders (n-8) reads the DB (n-7) beside the Orders DB (n-5)');
    // Two parts called "DB": one saying names the one the prose reaches first.
    expect(substituteLocationRefs('the DB (node.7) replicates to node.9', nested)).toBe(
      'the DB (n-7) replicates to n-9 · database · DB',
    );
  });

  describe('a path, and a part named twice', () => {
    // Revision #8–#9 of the click-counter session, as the panel read them.
    const path: LocatedRef[] = [
      { ref: 'edge.1', label: 'e-1 · n-1 → n-2 (sync)', part: 'edge', key: 'e-1' },
      { ref: 'edge.2', label: 'e-2 · n-2 → ai-lb (sync)', part: 'edge', key: 'e-2' },
      {
        ref: 'edge.3',
        label: 'ai-e-lb-svc · ai-lb → n-3 (sync)',
        part: 'edge',
        key: 'ai-e-lb-svc',
      },
      { ref: 'edge.5', label: 'e-4 · n-3 → n-4 (sync)', part: 'edge', key: 'e-4' },
      { ref: 'edge.15', label: 'e-6 · n-4 → n-6 (sync)', part: 'edge', key: 'e-6' },
      {
        ref: 'edge.20',
        label: 'ai-e-stats-read · n-3 → ai-counts-store (sync)',
        part: 'edge',
        key: 'ai-e-stats-read',
      },
      {
        ref: 'node.12',
        label: 'n-6 · replica · Links DB Sync Standby',
        part: 'node',
        key: 'n-6',
        name: 'Links DB Sync Standby',
      },
      {
        ref: 'node.13',
        label: 'ai-db-replica · replica · Links DB Read Replicas',
        part: 'node',
        key: 'ai-db-replica',
        name: 'Links DB Read Replicas',
      },
      {
        ref: 'rationale.10',
        label: 'Links DB Sync Standby rationale (n-6)',
        part: 'rationale',
        key: 'n-6',
      },
    ];
    const read = (prose: string) => substituteLocationRefs(prose, path);

    it('[EVAL-2] a path written as a list of refs reads as its parts’ keys, never one full label per hop', () => {
      expect(read('every redirect crosses (edge.1,edge.2,edge.3,edge.5,edge.15)')).toBe(
        'every redirect crosses (e-1,e-2,ai-e-lb-svc,e-4,e-6)',
      );
      expect(read('the hot path edge.1→edge.2→edge.3 holds no cache')).toBe(
        'the hot path e-1→e-2→ai-e-lb-svc holds no cache',
      );
      // Refs a sentence joins with words are each introduced in full.
      expect(read('edge.1 and later edge.15 are sync')).toBe(
        'e-1 · n-1 → n-2 (sync) and later e-6 · n-4 → n-6 (sync) are sync',
      );
    });

    it('[EVAL-2] a ref written beside its part’s own key names the part once — the key, and the name when unsaid', () => {
      expect(read('(ending at edge.15/e-6, the sync standby ack)')).toBe(
        '(ending at e-6, the sync standby ack)',
      );
      expect(read('reads n-3→ai-e-stats-read (edge.20) on every redirect')).toBe(
        'reads n-3→ai-e-stats-read on every redirect',
      );
      expect(read('the read path omits ai-db-replica (node.13)')).toBe(
        'the read path omits ai-db-replica (Links DB Read Replicas)',
      );
      expect(read('replicas (ai-db-replica, node.13) lag')).toBe(
        'replicas (ai-db-replica, Links DB Read Replicas) lag',
      );
      expect(read('node.12 (n-6) acks every write')).toBe(
        'Links DB Sync Standby (n-6) acks every write',
      );
      // A key nobody wrote beside the ref is no pair: "n-6 is" is a sentence, not a name.
      expect(read('n-6 is the standby; node.12 acks')).toBe(
        'n-6 is the standby; n-6 · replica · Links DB Sync Standby acks',
      );
    });

    it('[EVAL-2] a key a label has already said is said: a part named in a rationale’s label reads by its key after', () => {
      expect(read('Rationale.10 relies on the sync standby (n-6/node.12)')).toBe(
        'Links DB Sync Standby rationale (n-6) relies on the sync standby (n-6)',
      );
      expect(read('Rationale.10 relies on node.12')).toBe(
        'Links DB Sync Standby rationale (n-6) relies on n-6',
      );
    });
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
      'decision: Own a read model',
    ]);
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
