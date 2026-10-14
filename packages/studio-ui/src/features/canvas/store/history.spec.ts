import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../../testing/fixtures';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { HISTORY_LIMIT, selectCanRedo, selectCanUndo } from './state';

describe('canvas-store', () => {
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
});
