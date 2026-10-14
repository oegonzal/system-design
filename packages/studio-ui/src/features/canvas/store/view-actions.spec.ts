import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore, type CanvasStore } from '../canvas-store';

describe('canvas-store', () => {
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

    it('[UX-2] keeps a multi-selection React Flow made, and the panel is about the last element added to it', () => {
      const store = createCanvasStore(makeGraph());

      store.getState().onNodesChange([{ type: 'select', id: 'n-1', selected: true }]);
      store.getState().onNodesChange([{ type: 'select', id: 'n-3', selected: true }]);
      store.getState().onEdgesChange([{ type: 'select', id: 'e-2', selected: true }]);

      expect(selectedFlags(store)).toEqual(['n-1', 'n-3', 'e-2']);
      expect(store.getState().selectedId).toBe('e-2');
    });

    it('[UX-2] inspect moves the panel to a selected element without touching the selection, and does nothing for one that is not selected', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().onNodesChange([
        { type: 'select', id: 'n-1', selected: true },
        { type: 'select', id: 'n-2', selected: true },
      ]);
      expect(store.getState().selectedId).toBe('n-2');

      // A plain click on one of the selected blocks: the panel follows, the selection stays.
      store.getState().inspect('n-1');
      expect(store.getState().selectedId).toBe('n-1');
      expect(selectedFlags(store)).toEqual(['n-1', 'n-2']);

      // A block the canvas has not selected is not the panel's to show.
      store.getState().inspect('n-3');
      expect(store.getState().selectedId).toBe('n-1');
      expect(selectedFlags(store)).toEqual(['n-1', 'n-2']);

      // Nor is a connection — the same rule for every element.
      store.getState().inspect('e-1');
      expect(store.getState().selectedId).toBe('n-1');
      store.getState().onEdgesChange([{ type: 'select', id: 'e-1', selected: true }]);
      store.getState().inspect('n-2');
      expect(store.getState().selectedId).toBe('n-2');
      expect(selectedFlags(store)).toEqual(['n-1', 'n-2', 'e-1']);
    });
  });
});
