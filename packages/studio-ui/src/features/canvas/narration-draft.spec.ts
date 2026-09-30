import type { CanvasGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../testing/fixtures';
import { narrationSlotState, reconcileNarration } from './narration-draft';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Client' },
    { id: 'n-3', kind: 'database', label: 'Orders DB' },
  ],
  edges: [],
};

const criteria = makeCriteria();

const PROSE =
  'The Orders DB persists every order and owns the write path. ' +
  'It is the source of truth that reads reconcile against.';

describe('narrationSlotState', () => {
  it('knows written from unwritten and nothing more — substance is the critic’s call', () => {
    expect(narrationSlotState('   ')).toBe('empty');
    expect(narrationSlotState('too short')).toBe('filled');
    expect(narrationSlotState(PROSE)).toBe('filled');
  });
});

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

  it('drops a narration for a criterion the prompt never derived', () => {
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
