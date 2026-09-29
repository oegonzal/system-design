import { describe, expect, it } from 'vitest';

import type { CanvasGraph, DesignNarrative } from './canvas.schema';
import { validateNarration } from './narration-validator';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: '' },
    { id: 'n-2', kind: 'service', label: '' },
  ],
  edges: [],
};
const criteria = [{ id: 'c1' }];
const narrative = (overrides: Partial<DesignNarrative>): DesignNarrative => ({
  version: 1,
  componentRationales: [],
  criterionNarrations: [],
  ...overrides,
});

describe('validateNarration', () => {
  it('[DEL-5] accepts prose keyed to known nodes and criteria, however thin', () => {
    expect(
      validateNarration(
        graph,
        narrative({
          overview: 'ok',
          componentRationales: [{ nodeId: 'n-2', prose: 'It serves.' }],
          criterionNarrations: [{ criterionId: 'c1', prose: 'Then it is met.' }],
        }),
        criteria,
      ),
    ).toEqual([]);
  });

  it('rejects rationales and narrations keyed to nothing on the canvas or in the rubric, or keyed twice', () => {
    expect(
      validateNarration(
        graph,
        narrative({
          componentRationales: [
            { nodeId: 'ghost', prose: '' },
            { nodeId: 'n-1', prose: '' },
            { nodeId: 'n-1', prose: '' },
          ],
          criterionNarrations: [
            { criterionId: 'c7', prose: '' },
            { criterionId: 'c1', prose: '' },
            { criterionId: 'c1', prose: '' },
          ],
        }),
        criteria,
      ),
    ).toEqual([
      'narrative explains unknown node: ghost',
      'narrative explains node n-1 twice',
      'narrative narrates unknown criterion: c7',
      'narrative narrates criterion c1 twice',
    ]);
  });
});
