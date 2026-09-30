import { describe, expect, it } from 'vitest';

import type { CriterionRef } from './brief-validator';
import type { CanvasGraph } from './canvas.schema';
import { reconcileNarration } from './narration-repair';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Client' },
    { id: 'n-3', kind: 'database', label: 'Orders DB' },
  ],
  edges: [],
};

const criteria: CriterionRef[] = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({ id }));

const PROSE =
  'The Orders DB persists every order and owns the write path. ' +
  'It is the source of truth that reads reconcile against.';

describe('reconcileNarration', () => {
  it('returns null when nothing is written', () => {
    expect(reconcileNarration('', [], [], graph, criteria)).toBeNull();
    expect(
      reconcileNarration('   ', [{ nodeId: 'n-3', prose: '  ' }], [], graph, criteria),
    ).toBeNull();
  });

  it('drops a rationale for a node the graph no longer has', () => {
    expect(
      reconcileNarration('', [{ nodeId: 'ghost', prose: PROSE }], [], graph, criteria),
    ).toBeNull();
  });

  it('drops a narration for a criterion the rubric never listed', () => {
    expect(
      reconcileNarration('', [], [{ criterionId: 'c99', prose: PROSE }], graph, criteria),
    ).toBeNull();
  });

  it('keeps thin-but-present prose — substance is the explanation critic’s call', () => {
    expect(
      reconcileNarration('', [{ nodeId: 'n-3', prose: 'too short' }], [], graph, criteria),
    ).toEqual({
      version: 1,
      componentRationales: [{ nodeId: 'n-3', prose: 'too short' }],
      criterionNarrations: [],
    });
  });

  it('trims prose, de-duplicates ids, and omits an empty overview', () => {
    expect(
      reconcileNarration(
        '   ',
        [
          { nodeId: 'n-3', prose: `  ${PROSE}  ` },
          { nodeId: 'n-3', prose: 'a later duplicate' },
        ],
        [
          { criterionId: 'c1', prose: PROSE },
          { criterionId: 'c1', prose: 'a later duplicate' },
        ],
        graph,
        criteria,
      ),
    ).toEqual({
      version: 1,
      componentRationales: [{ nodeId: 'n-3', prose: PROSE }],
      criterionNarrations: [{ criterionId: 'c1', prose: PROSE }],
    });
  });
});
