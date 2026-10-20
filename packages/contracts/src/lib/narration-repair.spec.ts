import { describe, expect, it } from 'vitest';

import type { CriterionRef } from './brief-validator';
import { NARRATION_OVERVIEW_BOUND, NARRATION_PROSE_BOUND } from './canvas';
import { designNarrativeSchema, type CanvasGraph } from './canvas.schema';
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

  it('[UX-23] keeps a rationale’s trade-off, keeps a slot written only as a trade-off, and omits a blank one', () => {
    const narrative = reconcileNarration(
      '',
      [
        { nodeId: 'n-3', prose: PROSE, tradeoff: '  a store of its own rather than a view  ' },
        { nodeId: 'n-1', prose: '', tradeoff: 'a thin client rather than a native app' },
        { nodeId: 'n-3', prose: 'a duplicate', tradeoff: '' },
      ],
      [],
      graph,
      criteria,
    );
    expect(narrative?.componentRationales).toEqual([
      { nodeId: 'n-3', prose: PROSE, tradeoff: 'a store of its own rather than a view' },
      { nodeId: 'n-1', prose: '', tradeoff: 'a thin client rather than a native app' },
    ]);
    expect(designNarrativeSchema.safeParse(narrative).success).toBe(true);
  });

  it('[UX-23] keeps every decision with a choice, trims its fields, omits the blank ones, drops a node the canvas lacks, and is null when nothing else is written', () => {
    const narrative = reconcileNarration('', [], [], graph, criteria, [
      {
        choice: '  Own a read model  ',
        alternative: ' Query both sources live ',
        cost: '',
        reconsiderWhen: undefined,
        nodeIds: ['n-3', 'ghost', 'n-3'],
      },
      { choice: '   ', alternative: 'decided nothing' },
      { choice: 'One queue for both feeds', nodeIds: ['ghost'] },
    ]);
    expect(narrative).toEqual({
      version: 1,
      componentRationales: [],
      criterionNarrations: [],
      decisions: [
        { choice: 'Own a read model', alternative: 'Query both sources live', nodeIds: ['n-3'] },
        { choice: 'One queue for both feeds' },
      ],
    });
    expect(designNarrativeSchema.safeParse(narrative).success).toBe(true);
    expect(reconcileNarration('', [], [], graph, criteria, [{ choice: ' ' }])).toBeNull();
  });

  it('keeps prose past its bound whole for the schema to refuse — nothing is cut to fit', () => {
    const long = 'x'.repeat(NARRATION_PROSE_BOUND.ceiling + 1);
    const overview = 'y'.repeat(NARRATION_OVERVIEW_BOUND.ceiling + 1);
    const narrative = reconcileNarration(
      `  ${overview}  `,
      [{ nodeId: 'n-3', prose: long }],
      [{ criterionId: 'c1', prose: long }],
      graph,
      criteria,
    );
    expect(narrative).toEqual({
      version: 1,
      overview,
      componentRationales: [{ nodeId: 'n-3', prose: long }],
      criterionNarrations: [{ criterionId: 'c1', prose: long }],
    });
    expect(designNarrativeSchema.safeParse(narrative).success).toBe(false);
  });
});
