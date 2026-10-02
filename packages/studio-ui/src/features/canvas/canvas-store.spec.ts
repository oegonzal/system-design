import { describe, expect, it } from 'vitest';

import { makeCriteria, makeGraph, makeInterfaceGraph } from '../../testing/fixtures';
import {
  createCanvasStore,
  HISTORY_LIMIT,
  selectCanRedo,
  selectCanUndo,
  type CanvasStore,
  type CanvasViewport,
} from './canvas-store';
import { viewArea } from './framing';
import {
  contains,
  NODE_FOOTPRINT,
  NODE_GAP,
  NODE_MIN_FOOTPRINT,
  overlaps,
  type Box,
} from './geometry';
import { boxOf } from './placement';

const criteria = makeCriteria();

describe('canvas-store', () => {
  it('[UX-2] adds a node with a sequential id, default label, selection and dirty flag', () => {
    const store = createCanvasStore();

    const node = store.getState().addNode('database');

    expect(node?.id).toBe('n-1');
    expect(node?.data.label).toBe('Database');
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().selectedId).toBe('n-1');
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-2] connects two nodes with a sync edge and rejects self-loops and duplicates', () => {
    const store = createCanvasStore();
    store.getState().addNode('service');
    store.getState().addNode('database');
    const connection = { source: 'n-1', target: 'n-2', sourceHandle: null, targetHandle: null };

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
      .onConnect({ source: 'n-1', target: 'n-1', sourceHandle: null, targetHandle: null });
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

  describe('session draft', () => {
    it('[UX-15] serializeDraft keeps the bindings exactly as typed and nulls an unwritten half', () => {
      const store = createCanvasStore(makeGraph());
      expect(store.getState().serializeDraft()).toEqual({
        graph: makeGraph(),
        brief: null,
        narrative: null,
      });

      // Half-typed: a claim with no component yet, which a submission would drop.
      store.getState().setBindingClaim('c3', 'The database holds it');
      store.getState().setNarrativeOverview('Reads and writes are split.');
      expect(store.getState().serializeDraft()).toEqual({
        graph: makeGraph(),
        brief: {
          version: 1,
          bindings: [{ criterionId: 'c3', nodeIds: [], claim: 'The database holds it' }],
        },
        narrative: {
          version: 1,
          overview: 'Reads and writes are split.',
          componentRationales: [],
          criterionNarrations: [],
        },
      });
    });

    it('[UX-15] loadDraft restores every half and leaves the canvas dirty — a draft is unsubmitted work', () => {
      const store = createCanvasStore();
      store.getState().loadDraft({
        graph: makeGraph(),
        brief: { version: 1, bindings: [{ criterionId: 'c1', nodeIds: ['n-3'], claim: '' }] },
        narrative: {
          version: 1,
          componentRationales: [{ nodeId: 'n-3', prose: 'Persists every order.' }],
          criterionNarrations: [],
        },
      });

      expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-1', 'n-2', 'n-3']);
      expect(store.getState().bindings).toEqual([
        { criterionId: 'c1', nodeIds: ['n-3'], claim: '' },
      ]);
      expect(store.getState().componentRationales).toEqual([
        { nodeId: 'n-3', prose: 'Persists every order.' },
      ]);
      expect(store.getState().narrativeOverview).toBe('');
      expect(store.getState().dirty).toBe(true);
      // Round trip: what was restored is what would be saved again.
      expect(store.getState().serializeDraft().brief).toEqual({
        version: 1,
        bindings: [{ criterionId: 'c1', nodeIds: ['n-3'], claim: '' }],
      });
    });
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

  describe('placing a block', () => {
    /** A canvas on screen: an 800 × 600 pane at 100%, unpanned, that records what it is asked to show. */
    function attachCanvas(store: CanvasStore, pane = { width: 800, height: 600 }) {
      const revealed: Box[] = [];
      const viewport: CanvasViewport = {
        area: () => viewArea(pane, [0, 0, 1]),
        reveal: (box) => revealed.push(box),
      };
      store.getState().attachViewport(viewport);
      const clear = viewport.area()?.clear;
      if (!clear) throw new Error('the test pane has no size');
      return { revealed, clear };
    }

    it('[UX-2] centres a click-added block in what the canvas reports the author can see in full', () => {
      const store = createCanvasStore();
      const { clear, revealed } = attachCanvas(store);

      const node = store.getState().addNode('cache');

      expect(node?.position).toEqual({
        x: clear.width / 2 - NODE_FOOTPRINT.width / 2,
        y: clear.height / 2 - NODE_FOOTPRINT.height / 2,
      });
      expect(revealed).toEqual([]);
    });

    it('[UX-2] keeps consecutive adds a gap clear of each other and on screen', () => {
      const store = createCanvasStore();
      const { clear, revealed } = attachCanvas(store);

      for (const kind of ['client', 'cdn', 'dns', 'service'] as const)
        store.getState().addNode(kind);

      const boxes = store.getState().nodes.map(boxOf);
      for (const [index, a] of boxes.entries()) {
        expect(contains(clear, a)).toBe(true);
        for (const b of boxes.slice(index + 1)) {
          const grown = {
            x: a.x - NODE_GAP,
            y: a.y - NODE_GAP,
            width: a.width + NODE_GAP * 2,
            height: a.height + NODE_GAP * 2,
          };
          expect(overlaps(grown, b)).toBe(false);
        }
      }
      expect(revealed).toEqual([]);
    });

    it('[UX-2] on a canvas with no visible room left, adds beside what is visible and has the view show the new block', () => {
      const store = createCanvasStore();
      // A pane with room for exactly one block that nothing floats over.
      const { clear, revealed } = attachCanvas(store, {
        width: NODE_FOOTPRINT.width + NODE_GAP,
        height: 200,
      });

      const first = store.getState().addNode('client');
      expect(first && contains(clear, boxOf(first))).toBe(true);
      expect(revealed).toEqual([]);

      const second = store.getState().addNode('service');
      expect(second && contains(clear, boxOf(second))).toBe(false);
      expect(second && first && overlaps(boxOf(second), boxOf(first))).toBe(false);
      expect(revealed).toEqual([{ ...second?.position, ...NODE_FOOTPRINT }]);
    });

    it('[UX-2] a dropped block lands exactly where it was dropped', () => {
      const store = createCanvasStore();
      store.getState().addNode('queue', { x: 12, y: 34 });
      expect(store.getState().nodes[0]?.position).toEqual({ x: 12, y: 34 });

      const { revealed } = attachCanvas(store);
      store.getState().addNode('cache', { x: 300, y: 500 });
      // Under the minimap's band is still on the pane: the author chose it.
      expect(store.getState().nodes[1]?.position).toEqual({ x: 300, y: 500 });
      expect(revealed).toEqual([]);
    });

    it('[UX-2] a drop past the pane’s edge is pulled back onto it, never left out of sight', () => {
      const store = createCanvasStore();
      attachCanvas(store, { width: 692, height: 600 });

      const node = store.getState().addNode('cache', { x: 780, y: 280 });

      expect(node?.position).toEqual({ x: 692 - NODE_MIN_FOOTPRINT.width, y: 280 });
    });
  });

  describe('selection', () => {
    const selectedFlags = (store: CanvasStore) =>
      [...store.getState().nodes, ...store.getState().edges]
        .filter((element) => element.selected)
        .map((element) => element.id);

    it('select marks exactly that element on the canvas, and select(null) none', () => {
      const store = createCanvasStore(makeGraph());

      store.getState().select('n-1');
      store.getState().select('e-2');
      expect(store.getState().selectedId).toBe('e-2');
      expect(selectedFlags(store)).toEqual(['e-2']);

      store.getState().select(null);
      expect(store.getState().selectedId).toBeNull();
      expect(selectedFlags(store)).toEqual([]);
    });

    it('a newly added block is the one selected, on the canvas as in the panel', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().select('e-1');

      const node = store.getState().addNode('cache');

      expect(store.getState().selectedId).toBe(node?.id);
      expect(selectedFlags(store)).toEqual([node?.id]);
    });

    it('follows what React Flow selects — a key or a drag selects without any click', () => {
      const store = createCanvasStore(makeGraph());

      store.getState().onEdgesChange([{ type: 'select', id: 'e-1', selected: true }]);
      expect(store.getState().selectedId).toBe('e-1');

      // Selecting a block deselects the connection: two reports, either order.
      store.getState().onNodesChange([{ type: 'select', id: 'n-2', selected: true }]);
      store.getState().onEdgesChange([{ type: 'select', id: 'e-1', selected: false }]);
      expect(store.getState().selectedId).toBe('n-2');
    });

    it('clears when React Flow deselects the element the panel shows — a click on the empty pane, Escape', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().select('e-2');

      store.getState().onEdgesChange([{ type: 'select', id: 'e-2', selected: false }]);

      expect(store.getState().selectedId).toBeNull();
      expect(selectedFlags(store)).toEqual([]);
    });

    it('falls back to what is still selected when one of several is deselected', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().onNodesChange([
        { type: 'select', id: 'n-1', selected: true },
        { type: 'select', id: 'n-2', selected: true },
      ]);
      expect(store.getState().selectedId).toBe('n-2');

      store.getState().onNodesChange([{ type: 'select', id: 'n-2', selected: false }]);
      expect(store.getState().selectedId).toBe('n-1');
    });
  });

  describe('content version', () => {
    it('[UX-15] counts edits, and never a selection, a measured size or a highlight', () => {
      const store = createCanvasStore(makeGraph());
      const version = () => store.getState().contentVersion;
      const start = version();

      store.getState().select('n-1');
      store.getState().onNodesChange([{ type: 'select', id: 'n-1', selected: true }]);
      store
        .getState()
        .onNodesChange([{ type: 'dimensions', id: 'n-1', dimensions: { width: 160, height: 48 } }]);
      store.getState().setHighlight({ nodeIds: ['n-3'], edgeIds: [], severity: 'high' });
      store.getState().clearHighlight();
      expect(version()).toBe(start);
      expect(store.getState().dirty).toBe(false);

      store.getState().updateNode('n-1', { label: 'Browser' });
      expect(version()).toBe(start + 1);
      store.getState().setNarrativeOverview('Reads are cached.');
      expect(version()).toBe(start + 2);
    });
  });

  describe('read-only', () => {
    it('[UX-16] refuses every author edit while set, whichever control asks', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().setBindingClaim('c1', 'before');
      store.getState().setReadOnly(true);
      const before = store.getState();

      expect(store.getState().addNode('cache')).toBeNull();
      store.getState().updateNode('n-1', { label: 'changed' });
      store.getState().updateEdge('e-1', { kind: 'async' });
      store
        .getState()
        .onConnect({ source: 'n-3', target: 'n-1', sourceHandle: null, targetHandle: null });
      store.getState().onNodesChange([
        { type: 'position', id: 'n-1', position: { x: 999, y: 999 } },
        { type: 'remove', id: 'n-2' },
      ]);
      store.getState().onEdgesChange([{ type: 'remove', id: 'e-1' }]);
      store.getState().select('n-2');
      store.getState().removeSelected();
      store.getState().clear();
      store.getState().setBindingClaim('c1', 'after');
      store.getState().toggleBindingNode('c1', 'n-1');
      store.getState().setNarrativeOverview('changed');
      store.getState().setComponentRationale('n-1', 'changed');
      store.getState().undo();

      const after = store.getState();
      expect(after.nodes.map((node) => [node.id, node.data.label, node.position])).toEqual(
        before.nodes.map((node) => [node.id, node.data.label, node.position]),
      );
      expect(after.edges).toEqual(before.edges);
      expect(after.bindings).toEqual(before.bindings);
      expect(after.narrativeOverview).toBe('');
      expect(after.componentRationales).toEqual([]);
      expect(after.contentVersion).toBe(before.contentVersion);
      expect(selectCanUndo(after)).toBe(false);
    });

    it('still selects, highlights and loads — a revision on screen can be looked at', () => {
      const store = createCanvasStore();
      store.getState().setReadOnly(true);

      store.getState().setGraph(makeGraph());
      store.getState().onNodesChange([{ type: 'select', id: 'n-2', selected: true }]);
      store.getState().select('n-2');
      store.getState().setHighlight({ nodeIds: ['n-3'], edgeIds: [], severity: 'low' });

      expect(store.getState().nodes).toHaveLength(3);
      expect(store.getState().selectedId).toBe('n-2');
      expect(store.getState().nodes.find((node) => node.id === 'n-2')?.selected).toBe(true);
      expect(store.getState().highlight?.nodeIds).toEqual(['n-3']);

      store.getState().setReadOnly(false);
      expect(store.getState().addNode('cache')).not.toBeNull();
    });
  });

  describe('undo and redo', () => {
    const labels = (store: CanvasStore) => store.getState().nodes.map((node) => node.data.label);

    it('[UX-16] walks edits back and forth, and a new edit forgets what was undone', () => {
      const store = createCanvasStore();
      store.getState().addNode('service');
      store.getState().addNode('database');
      expect(selectCanUndo(store.getState())).toBe(true);
      expect(selectCanRedo(store.getState())).toBe(false);

      store.getState().undo();
      expect(labels(store)).toEqual(['Service']);
      expect(store.getState().selectedId).toBeNull();
      expect(store.getState().dirty).toBe(true);
      expect(selectCanRedo(store.getState())).toBe(true);

      store.getState().redo();
      expect(labels(store)).toEqual(['Service', 'Database']);

      store.getState().undo();
      store.getState().addNode('cache');
      expect(selectCanRedo(store.getState())).toBe(false);
      expect(labels(store)).toEqual(['Service', 'Cache']);
    });

    it('[UX-16] a typed label is one step, and so is a whole drag', () => {
      const store = createCanvasStore(makeGraph());
      for (const label of ['C', 'Ch', 'Che', 'Checkout']) {
        store.getState().updateNode('n-2', { label });
      }
      store
        .getState()
        .onNodesChange([
          { type: 'position', id: 'n-1', position: { x: 10, y: 10 }, dragging: true },
        ]);
      store
        .getState()
        .onNodesChange([
          { type: 'position', id: 'n-1', position: { x: 20, y: 20 }, dragging: true },
        ]);
      store
        .getState()
        .onNodesChange([
          { type: 'position', id: 'n-1', position: { x: 30, y: 30 }, dragging: false },
        ]);
      expect(store.getState().history.past).toHaveLength(2);

      store.getState().undo();
      expect(store.getState().nodes[0]?.position).toEqual(makeGraph().nodes[0]?.position);
      expect(labels(store)[1]).toBe('Checkout');
      store.getState().undo();
      expect(labels(store)[1]).toBe('Order Service');
    });

    it('[UX-16] a deleted block comes back with its connections in one step', () => {
      const store = createCanvasStore(makeGraph());

      store.getState().removeElements({ nodeIds: ['n-2'], edgeIds: [] });
      expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-1', 'n-3']);
      expect(store.getState().edges).toHaveLength(0);

      store.getState().undo();
      expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-1', 'n-2', 'n-3']);
      expect(store.getState().edges.map((edge) => edge.id)).toEqual(['e-1', 'e-2']);
    });

    it('[UX-16] Clear is one step back to the diagram, and keeps the brief and narrative', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().setNarrativeOverview('kept');

      store.getState().clear();
      expect(store.getState().nodes).toHaveLength(0);
      expect(store.getState().narrativeOverview).toBe('kept');

      store.getState().undo();
      expect(store.getState().nodes).toHaveLength(3);
    });

    it('covers the brief and narrative too, and repaints the live highlight on what it restores', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().setBindingClaim('c1', 'claim');
      store.getState().removeElements({ nodeIds: ['n-3'], edgeIds: [] });
      store.getState().setHighlight({ nodeIds: ['n-3'], edgeIds: [], severity: 'high' });

      store.getState().undo();
      expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.severity).toBe('high');
      store.getState().undo();
      expect(store.getState().bindings).toEqual([]);
    });

    it('keeps at most HISTORY_LIMIT steps, and a load starts a new history', () => {
      const store = createCanvasStore();
      for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
        store.getState().addNode('service');
      }
      expect(store.getState().history.past).toHaveLength(HISTORY_LIMIT);

      store.getState().setGraph(makeGraph());
      expect(selectCanUndo(store.getState())).toBe(false);
      expect(selectCanRedo(store.getState())).toBe(false);
    });
  });

  describe('fit requests', () => {
    it('asks for a fit on every load that draws something, and when asked', () => {
      expect(createCanvasStore().getState().fitRequest).toBe(0);
      const store = createCanvasStore(makeGraph());
      expect(store.getState().fitRequest).toBe(1);

      store.getState().setGraph(makeGraph());
      expect(store.getState().fitRequest).toBe(2);
      store.getState().setGraph({ nodes: [], edges: [] });
      expect(store.getState().fitRequest).toBe(2);
      store.getState().loadDraft({ graph: makeGraph(), brief: null, narrative: null });
      expect(store.getState().fitRequest).toBe(3);
      store.getState().requestFit();
      expect(store.getState().fitRequest).toBe(4);
      // An edit is not a load: the author's view stays where it is.
      store.getState().addNode('cache');
      expect(store.getState().fitRequest).toBe(4);
    });
  });
});
