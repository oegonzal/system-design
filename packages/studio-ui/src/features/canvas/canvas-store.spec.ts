import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../testing/fixtures';
import { createCanvasStore } from './canvas-store';
import { selectCanUndo } from './store/state';

describe('canvas-store', () => {
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
