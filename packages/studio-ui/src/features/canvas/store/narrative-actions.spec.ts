import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../../testing/fixtures';
import { makeGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore } from '../canvas-store';

const criteria = makeCriteria();

describe('canvas-store', () => {
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
});
