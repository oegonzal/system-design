import { describe, expect, it } from 'vitest';

import { makeCriteria } from '../../testing/fixtures';
import { makeBrief, makeGraph, makeNarrative } from '../../testing/canvas-fixtures';
import { briefMarkdown, narrativeMarkdown } from './markdown';

// makeGraph: n-1 Client → n-2 Order Service → n-3 Orders DB (edges e-1, e-2).
const graph = makeGraph();
const criteria = makeCriteria();

describe('the trade-offs in an export', () => {
  it('[UX-23] prints each binding’s trade-off in its own column, a dash where none was given', () => {
    const brief = makeBrief();
    brief.bindings[0] = { ...brief.bindings[0], tradeoff: 'a table rather than a cache' };
    const md = briefMarkdown(brief, graph, criteria);
    expect(md).toMatch(
      /Client → Order Service, then Order Service → Orders DB \| a table rather than a cache \|/,
    );
    expect(md).toMatch(/Orders DB \| — \| — \|/);
  });

  it('[UX-23] prints a rationale’s “instead of” under it and the decisions as their own section, dashes where a slot is empty', () => {
    const narrative = makeNarrative();
    narrative.componentRationales[0] = {
      ...narrative.componentRationales[0],
      tradeoff: 'a database of its own rather than a view over the storefront’s',
    };
    narrative.decisions = [
      {
        choice: 'Own a read model',
        alternative: 'Query both sources live',
        cost: 'Staleness up to the batch interval',
        nodeIds: ['n-3'],
      },
      { choice: 'One queue for both feeds' },
    ];
    const md = narrativeMarkdown(narrative, graph, criteria);
    expect(md).toContain(
      '_Instead of:_ a database of its own rather than a view over the storefront’s',
    );
    expect(md).toContain('## Decisions the design rests on');
    expect(md).toContain(
      '### Own a read model\n\n- Instead of: Query both sources live\n- Cost: Staleness up to the batch interval\n- Reconsider when: —\n- Concerns: Orders DB',
    );
    expect(md).toContain(
      '### One queue for both feeds\n\n- Instead of: —\n- Cost: —\n- Reconsider when: —',
    );
    expect(narrativeMarkdown(makeNarrative(), graph, criteria)).toContain(
      '## Decisions the design rests on\n\n_None._',
    );
  });
});
