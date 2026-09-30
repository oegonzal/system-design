import { describe, expect, it } from 'vitest';

import { makeCriteria, makeGraph, makeInterfaceGraph } from '../../testing/fixtures';
import { createCanvasStore } from './canvas-store';

const criteria = makeCriteria();

describe('canvas-store', () => {
  it('[UX-2] adds a node with a sequential id, default label, selection and dirty flag', () => {
    const store = createCanvasStore();

    const node = store.getState().addNode('database');

    expect(node.id).toBe('n-1');
    expect(node.data.label).toBe('Database');
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().selectedId).toBe('n-1');
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-2] connects two nodes with a sync edge and rejects self-loops and duplicates', () => {
    const store = createCanvasStore();
    const a = store.getState().addNode('service');
    const b = store.getState().addNode('database');
    const connection = { source: a.id, target: b.id, sourceHandle: null, targetHandle: null };

    store.getState().onConnect(connection);
    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().edges[0].id).toBe('e-1');
    expect(store.getState().edges[0].data?.kind).toBe('sync');

    // Exact duplicate — rejected.
    store.getState().onConnect(connection);
    expect(store.getState().edges).toHaveLength(1);

    // Self-loop — rejected.
    store
      .getState()
      .onConnect({ source: a.id, target: a.id, sourceHandle: null, targetHandle: null });
    expect(store.getState().edges).toHaveLength(1);
  });

  it('[UX-2] updates node label, kind and typed config entries', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().updateNode('n-2', { label: 'Checkout Service', kind: 'worker' });
    store.getState().updateNode('n-3', {
      config: [
        { key: 'replicas', value: 3 },
        { key: 'backups', value: true },
      ],
    });

    const n2 = store.getState().nodes.find((node) => node.id === 'n-2');
    const n3 = store.getState().nodes.find((node) => node.id === 'n-3');
    expect(n2?.data.label).toBe('Checkout Service');
    expect(n2?.data.kind).toBe('worker');
    expect(n3?.data.config).toEqual([
      { key: 'replicas', value: 3 },
      { key: 'backups', value: true },
    ]);
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-2] updates edge kind and label', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().updateEdge('e-1', { kind: 'async', label: 'order events' });

    const edge = store.getState().edges.find((candidate) => candidate.id === 'e-1');
    expect(edge?.data?.kind).toBe('async');
    expect(edge?.label).toBe('order events');
  });

  it('updateEdge preserves carries on a kind-only patch and clears them on an empty list', () => {
    const store = createCanvasStore(makeInterfaceGraph());

    store.getState().updateEdge('e-2', { kind: 'async' });
    const patched = store.getState().edges.find((edge) => edge.id === 'e-2');
    expect(patched?.data?.kind).toBe('async');
    expect(patched?.data?.carries).toEqual(['PlaceOrder', 'GetOrder']);

    store.getState().updateEdge('e-2', { carries: [] });
    const cleared = store.getState().edges.find((edge) => edge.id === 'e-2');
    expect(cleared?.data?.carries).toEqual([]);
    // …and an emptied list serializes as an absent key.
    expect(
      store
        .getState()
        .serialize()
        .edges.find((edge) => edge.id === 'e-2'),
    ).not.toHaveProperty('carries');
  });

  it('serialize round-trips the interface fixture unchanged', () => {
    const store = createCanvasStore(makeInterfaceGraph());
    expect(store.getState().serialize()).toEqual(makeInterfaceGraph());
  });

  it('[UX-2] removeSelected deletes a node together with its edges', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().select('n-2');
    store.getState().removeSelected();

    expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-1', 'n-3']);
    expect(store.getState().edges).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().dirty).toBe(true);
  });

  it('marks dirty and clears selection when React Flow removes the selected node', () => {
    const store = createCanvasStore(makeGraph());
    store.getState().select('n-1');
    store.getState().markClean();

    store.getState().onNodesChange([{ type: 'remove', id: 'n-1' }]);

    expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-2', 'n-3']);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().dirty).toBe(true);
  });

  it('setHighlight paints severity onto affected elements and clearHighlight wipes it', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().setHighlight({ nodeIds: ['n-3'], edgeIds: ['e-2'], severity: 'high' });

    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.severity).toBe('high');
    expect(
      store.getState().nodes.find((node) => node.id === 'n-1')?.data.severity ?? null,
    ).toBeNull();
    expect(store.getState().edges.find((edge) => edge.id === 'e-2')?.data?.severity).toBe('high');

    store.getState().clearHighlight();
    expect(store.getState().highlight).toBeNull();
    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.severity).toBeNull();
  });

  it('setGraph resets selection, dirty and highlight', () => {
    const store = createCanvasStore();
    store.getState().addNode('cache');
    store.getState().setHighlight({ nodeIds: ['n-1'], edgeIds: [], severity: 'low' });

    store.getState().setGraph(makeGraph());

    const state = store.getState();
    expect(state.nodes).toHaveLength(3);
    expect(state.selectedId).toBeNull();
    expect(state.dirty).toBe(false);
    expect(state.highlight).toBeNull();
  });

  it('serialize returns the wire graph for the current canvas', () => {
    const store = createCanvasStore(makeGraph());
    expect(store.getState().serialize()).toEqual(makeGraph());
  });

  describe('narrative', () => {
    it('setNarrativeOverview stores the overview and dirties the draft', () => {
      const store = createCanvasStore();
      store.getState().setNarrativeOverview('Reads and writes are split.');
      expect(store.getState().narrativeOverview).toBe('Reads and writes are split.');
      expect(store.getState().dirty).toBe(true);
    });

    it('setComponentRationale upserts a slot by node id and clears it on empty prose', () => {
      const store = createCanvasStore();

      store.getState().setComponentRationale('n-3', 'The Orders DB persists every order.');
      expect(store.getState().componentRationales).toEqual([
        { nodeId: 'n-3', prose: 'The Orders DB persists every order.' },
      ]);

      store.getState().setComponentRationale('n-3', '   ');
      expect(store.getState().componentRationales).toEqual([]);
    });

    it('setCriterionNarration upserts by criterion id and clears on empty prose', () => {
      const store = createCanvasStore();

      store.getState().setCriterionNarration('c2', 'Second.');
      store.getState().setCriterionNarration('c1', 'First.');
      store.getState().setCriterionNarration('c2', 'Second, revised.');
      expect(store.getState().criterionNarrations).toEqual([
        { criterionId: 'c1', prose: 'First.' },
        { criterionId: 'c2', prose: 'Second, revised.' },
      ]);

      store.getState().setCriterionNarration('c1', '');
      expect(store.getState().criterionNarrations.map((n) => n.criterionId)).toEqual(['c2']);
    });

    it('loadNarrative replaces the draft without touching dirty, mapping null to empty', () => {
      const store = createCanvasStore();

      store.getState().loadNarrative({
        version: 1,
        overview: 'Loaded overview.',
        componentRationales: [{ nodeId: 'n-3', prose: 'Loaded rationale.' }],
        criterionNarrations: [{ criterionId: 'c1', prose: 'Loaded narration.' }],
      });
      expect(store.getState().narrativeOverview).toBe('Loaded overview.');
      expect(store.getState().criterionNarrations).toEqual([
        { criterionId: 'c1', prose: 'Loaded narration.' },
      ]);
      expect(store.getState().dirty).toBe(false);

      // …and it never cleans an already-dirty draft either.
      store.getState().setNarrativeOverview('edited');
      store.getState().loadNarrative(null);
      expect(store.getState().narrativeOverview).toBe('');
      expect(store.getState().componentRationales).toEqual([]);
      expect(store.getState().dirty).toBe(true);
    });

    it('setGraph leaves the narrative alone — loading a revision pairs it with loadNarrative', () => {
      const store = createCanvasStore();
      store.getState().setNarrativeOverview('Prose that outlives a graph swap.');

      store.getState().setGraph(makeGraph());

      expect(store.getState().narrativeOverview).toBe('Prose that outlives a graph swap.');
      expect(store.getState().dirty).toBe(false);
    });

    it('serializeNarrative reconciles against the live graph and rubric, dropping stale slots', () => {
      const store = createCanvasStore(makeGraph()); // n-1 → n-2 → n-3
      store.getState().setNarrativeOverview('A read/write split keeps lookups fast.');
      store.getState().setComponentRationale('n-3', 'Persists every order.');
      store.getState().setComponentRationale('ghost', 'No such node.');
      store.getState().setCriterionNarration('c1', 'Client → service → database.');
      store.getState().setCriterionNarration('c99', 'No such criterion.');

      expect(store.getState().serializeNarrative(criteria)).toEqual({
        version: 1,
        overview: 'A read/write split keeps lookups fast.',
        componentRationales: [{ nodeId: 'n-3', prose: 'Persists every order.' }],
        criterionNarrations: [{ criterionId: 'c1', prose: 'Client → service → database.' }],
      });
      expect(createCanvasStore().getState().serializeNarrative(criteria)).toBeNull();
    });
  });

  /**
   * The brief slice obeys the same orthogonality rules as the narrative: it is
   * the author's own artifact, so a graph swap never rewrites it and only the
   * author's own edits dirty the draft.
   */
  describe('design brief', () => {
    it('setBindingClaim creates the binding on first use and dirties the draft', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().markClean();

      store.getState().setBindingClaim('c3', 'A replica keeps reads fast');

      expect(store.getState().bindings).toEqual([
        { criterionId: 'c3', nodeIds: [], claim: 'A replica keeps reads fast' },
      ]);
      expect(store.getState().dirty).toBe(true);
    });

    it('toggleBindingNode adds and removes components, capped at the contract', () => {
      const store = createCanvasStore(makeGraph());

      store.getState().toggleBindingNode('c3', 'n-3');
      expect(store.getState().bindings[0]).toEqual({
        criterionId: 'c3',
        nodeIds: ['n-3'],
        claim: '',
      });

      store.getState().toggleBindingNode('c3', 'n-2');
      store.getState().toggleBindingNode('c3', 'n-3');
      expect(store.getState().bindings[0]?.nodeIds).toEqual(['n-2']);

      // Untoggling the last component with no claim empties the binding entirely.
      store.getState().toggleBindingNode('c3', 'n-2');
      expect(store.getState().bindings).toEqual([]);
    });

    it('setBindingPath replaces the walk and an empty path removes the key', () => {
      const store = createCanvasStore(makeGraph());

      store.getState().setBindingPath('c1', ['e-1']);
      store.getState().setBindingPath('c1', ['e-1', 'e-2']);
      expect(store.getState().bindings).toEqual([
        { criterionId: 'c1', nodeIds: [], claim: '', path: ['e-1', 'e-2'] },
      ]);

      store.getState().setBindingClaim('c1', 'kept');
      store.getState().setBindingPath('c1', []);
      expect(store.getState().bindings).toEqual([
        { criterionId: 'c1', nodeIds: [], claim: 'kept' },
      ]);
    });

    it('clearBinding drops the whole binding', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().setBindingClaim('c1', 'x');
      store.getState().clearBinding('c1');
      expect(store.getState().bindings).toEqual([]);
    });

    it('loadBrief replaces the brief without touching dirty, mapping null to empty', () => {
      const store = createCanvasStore();

      store.getState().loadBrief({
        version: 1,
        bindings: [{ criterionId: 'c1', nodeIds: ['n-3'], claim: 'loaded' }],
      });
      expect(store.getState().bindings).toHaveLength(1);
      expect(store.getState().dirty).toBe(false);

      store.getState().loadBrief(null);
      expect(store.getState().bindings).toEqual([]);
    });

    it('setGraph leaves the brief alone — loading a revision pairs it with loadBrief', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().setBindingClaim('c1', 'kept');

      store.getState().setGraph(makeGraph());

      expect(store.getState().bindings).toHaveLength(1);
      expect(store.getState().dirty).toBe(false);
    });

    it('serializeBrief reconciles against the live graph and rubric, null when nothing is bound', () => {
      const store = createCanvasStore(makeGraph());
      expect(store.getState().serializeBrief(criteria)).toBeNull();

      store.getState().setBindingClaim('c3', 'The database holds it');
      // A claim with no component is incomplete: still nothing to send.
      expect(store.getState().serializeBrief(criteria)).toBeNull();

      store.getState().toggleBindingNode('c3', 'n-3');
      store.getState().setBindingPath('c3', ['e-1', 'e-2']);
      expect(store.getState().serializeBrief(criteria)).toEqual({
        version: 1,
        bindings: [
          {
            criterionId: 'c3',
            nodeIds: ['n-3'],
            path: ['e-1', 'e-2'],
            claim: 'The database holds it',
          },
        ],
      });

      // Deleting the bound component drops the claim rather than sending a
      // reference the API would reject.
      store.getState().select('n-3');
      store.getState().removeSelected();
      expect(store.getState().serializeBrief(criteria)).toBeNull();
    });
  });
});
