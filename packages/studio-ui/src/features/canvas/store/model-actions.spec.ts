import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore } from '../canvas-store';

describe('canvas-store', () => {
  describe('data model', () => {
    it('[UX-24] adds entities with fresh ids, patches them with blank optional slots cleared, and removes them with their relations', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().markClean();
      store.getState().addEntity();
      store.getState().addEntity();
      expect(store.getState().entities.map((entity) => entity.id)).toEqual(['ent-1', 'ent-2']);
      expect(store.getState().dirty).toBe(true);

      store.getState().updateEntity('ent-1', { name: 'Order', ownerNodeId: 'n-3', key: ' id ' });
      store.getState().updateEntity('ent-1', { ownerNodeId: '', key: '  ' });
      expect(store.getState().entities[0]).toEqual({
        id: 'ent-1',
        name: 'Order',
        fields: [],
        invariants: [],
        states: [],
      });

      store.getState().addRelation({ from: 'ent-1', to: 'ent-2', kind: 'contains' });
      store.getState().updateRelation(0, { note: 'owns its lines' });
      store.getState().updateRelation(0, { note: ' ' });
      expect(store.getState().relations).toEqual([
        { from: 'ent-1', to: 'ent-2', kind: 'contains' },
      ]);

      store.getState().removeEntity('ent-2');
      expect(store.getState().entities.map((entity) => entity.id)).toEqual(['ent-1']);
      expect(store.getState().relations).toEqual([]);
      store.getState().updateEntity('ghost', { name: 'nowhere' });
      expect(store.getState().entities).toHaveLength(1);
    });

    it('[UX-24] serializes the model reconciled against the live graph, keeps it as typed in a draft, and loads it back', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().addEntity();
      store.getState().updateEntity('ent-1', { name: 'Order', ownerNodeId: 'n-3' });
      store.getState().addEntity();
      expect(store.getState().serializeModel()).toEqual({
        version: 1,
        entities: [
          {
            id: 'ent-1',
            name: 'Order',
            ownerNodeId: 'n-3',
            fields: [],
            invariants: [],
            states: [],
          },
        ],
        relations: [],
      });
      const draft = store.getState().serializeDraft();
      expect(draft.model?.entities.map((entity) => entity.name)).toEqual(['Order', '']);

      const other = createCanvasStore();
      other.getState().loadModel(store.getState().serializeModel());
      expect(other.getState().entities.map((entity) => entity.id)).toEqual(['ent-1']);
      other.getState().loadModel(null);
      expect(other.getState().entities).toEqual([]);
      expect(createCanvasStore(makeGraph()).getState().serializeModel()).toBeNull();
    });

    it('[UX-24] a binding names the entities that hold a criterion, and the draft keeps the assumptions as typed', () => {
      const store = createCanvasStore(makeGraph());
      store.getState().addEntity();
      store.getState().updateEntity('ent-1', { name: 'Order' });
      store.getState().toggleBindingEntity('c3', 'ent-1');
      expect(store.getState().bindings).toEqual([
        { criterionId: 'c3', nodeIds: [], claim: '', entityIds: ['ent-1'] },
      ]);
      store.getState().toggleBindingEntity('c3', 'ent-1');
      expect(store.getState().bindings).toEqual([]);

      store.getState().addAssumption();
      store.getState().setAssumption(0, 'One shopper, one history.');
      store.getState().addAssumption();
      expect(store.getState().serializeDraft().narrative?.assumptions).toEqual([
        'One shopper, one history.',
        '',
      ]);
      expect(store.getState().serializeNarrative([{ id: 'c1' }])?.assumptions).toEqual([
        'One shopper, one history.',
      ]);
      store.getState().removeAssumption(1);
      store.getState().removeAssumption(0);
      expect(store.getState().assumptions).toEqual([]);
    });
  });
});
