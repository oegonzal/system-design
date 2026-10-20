import { describe, expect, it } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore } from '../canvas-store';

describe('canvas-store', () => {
  it('serialize round-trips the interface fixture unchanged', () => {
    const store = createCanvasStore(makeInterfaceGraph());
    expect(store.getState().serialize()).toEqual(makeInterfaceGraph());
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
    it('[UX-23] serializeDraft carries the decisions as typed, blank choice included, and loadDraft restores them', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().addDecision();
      store.getState().updateDecision(0, { alternative: 'Query live' });
      const draft = store.getState().serializeDraft();
      expect(draft.narrative).toEqual({
        version: 1,
        componentRationales: [],
        criterionNarrations: [],
        decisions: [{ choice: '', alternative: 'Query live' }],
      });
      const other = createCanvasStore();
      other.getState().loadDraft(draft);
      expect(other.getState().decisions).toEqual([{ choice: '', alternative: 'Query live' }]);
      // A submission drops the undecided row.
      expect(store.getState().serializeNarrative([{ id: 'c1' }])).toBeNull();
    });

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
      // …and saved work: the version it loaded as is the one the server holds.
      expect(store.getState().restoredVersion).toBe(store.getState().contentVersion);
      // Round trip: what was restored is what would be saved again.
      expect(store.getState().serializeDraft().brief).toEqual({
        version: 1,
        bindings: [{ criterionId: 'c1', nodeIds: ['n-3'], claim: '' }],
      });
    });
  });
});
