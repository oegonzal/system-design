import { describe, expect, it } from 'vitest';

import { makeCriteria, makeGraph } from '../../../testing/fixtures';
import { createCanvasStore } from '../canvas-store';

const criteria = makeCriteria();

describe('canvas-store', () => {
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
