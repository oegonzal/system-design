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

    it('[UX-23] setComponentTradeoff keeps a slot written only as a trade-off, and clearing the prose keeps it', () => {
      const store = createCanvasStore();
      store.getState().setComponentTradeoff('n-3', 'a store of its own rather than a view');
      expect(store.getState().componentRationales).toEqual([
        { nodeId: 'n-3', prose: '', tradeoff: 'a store of its own rather than a view' },
      ]);
      store.getState().setComponentRationale('n-3', 'Persists every order.');
      store.getState().setComponentRationale('n-3', '');
      expect(store.getState().componentRationales).toEqual([
        { nodeId: 'n-3', prose: '', tradeoff: 'a store of its own rather than a view' },
      ]);
      store.getState().setComponentTradeoff('n-3', '');
      expect(store.getState().componentRationales).toEqual([]);
    });

    it('[UX-23] decisions are added blank, patched field by field with blanks cleared, and removed by position', () => {
      const store = createCanvasStore();
      store.getState().addDecision();
      store.getState().addDecision();
      expect(store.getState().decisions).toEqual([{ choice: '' }, { choice: '' }]);
      store.getState().updateDecision(1, { choice: 'Own a read model', alternative: 'Query live' });
      store.getState().updateDecision(1, { nodeIds: ['n-3'], cost: '' });
      expect(store.getState().decisions[1]).toEqual({
        choice: 'Own a read model',
        alternative: 'Query live',
        nodeIds: ['n-3'],
      });
      store.getState().updateDecision(1, { nodeIds: [], alternative: '  ' });
      expect(store.getState().decisions[1]).toEqual({ choice: 'Own a read model' });
      store.getState().removeDecision(0);
      expect(store.getState().decisions).toEqual([{ choice: 'Own a read model' }]);
      expect(store.getState().dirty).toBe(true);
      store.getState().updateDecision(7, { choice: 'nowhere' });
      expect(store.getState().decisions).toHaveLength(1);
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
