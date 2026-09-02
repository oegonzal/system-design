import type { CanvasGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { narrationSlotState, reconcileNarration } from './narration-draft';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Client' },
    { id: 'n-3', kind: 'database', label: 'Orders DB' },
  ],
  edges: [],
};

const PROSE =
  'The Orders DB persists every order and owns the write path. ' +
  'It is the source of truth that reads reconcile against.';

describe('narrationSlotState', () => {
  it('classifies empty, thin, and explained prose', () => {
    expect(narrationSlotState('   ')).toBe('empty');
    expect(narrationSlotState('too short')).toBe('thin');
    expect(narrationSlotState(PROSE)).toBe('explained');
  });
});

describe('reconcileNarration', () => {
  it('returns null when nothing substantive is drafted', () => {
    expect(reconcileNarration('', [], [], graph)).toBeNull();
    expect(reconcileNarration('   ', [{ nodeId: 'n-3', prose: '  ' }], [], graph)).toBeNull();
  });

  it('drops a rationale for a node the graph no longer has', () => {
    const result = reconcileNarration('', [{ nodeId: 'ghost', prose: PROSE }], [], graph);
    expect(result).toBeNull();
  });

  it('keeps thin-but-present prose — substance is the grade’s call, not the editor’s', () => {
    const result = reconcileNarration('', [{ nodeId: 'n-3', prose: 'too short' }], [], graph);
    expect(result).toEqual({
      version: 1,
      componentRationales: [{ nodeId: 'n-3', prose: 'too short' }],
      flowNarrations: [],
    });
  });

  it('trims prose, de-duplicates node ids, and omits an empty overview', () => {
    const result = reconcileNarration(
      '   ',
      [
        { nodeId: 'n-3', prose: `  ${PROSE}  ` },
        { nodeId: 'n-3', prose: 'a later duplicate' },
      ],
      [{ requirementIndex: 0, prose: PROSE }],
      graph,
    );
    expect(result).toEqual({
      version: 1,
      componentRationales: [{ nodeId: 'n-3', prose: PROSE }],
      flowNarrations: [{ requirementIndex: 0, prose: PROSE }],
    });
  });
});
