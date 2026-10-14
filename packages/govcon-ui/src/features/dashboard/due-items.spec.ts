import { targetOf } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { PIPELINE_ROWS, TARGETS } from '../../testing/pipeline-fixtures';
import { dueItemsOf } from './due-items';

const NOW = Date.parse('2026-09-26T12:00:00Z');

describe('what is due', () => {
  it('[GOVU-26] takes a tracked notice by its reminder or its deadline and a tracked firm or award by its reminder alone — an award ending inside the week but with no reminder is not due — soonest first', () => {
    const items = dueItemsOf(PIPELINE_ROWS, TARGETS, NOW);
    expect(items.map((item) => [item.key, item.left])).toEqual([
      [expect.stringMatching(/^bid:/), 2],
      ['target:firm:JCBMLGPE6Z71', 4],
      ['bid:21b781192a4f4026a2946237984a9c06', 5],
    ]);
    const ending = targetOf({ endsAt: '2026-09-28', reminderAt: null });
    expect(dueItemsOf([], [ending], NOW)).toEqual([]);
    // A reminder that has passed is still due, and first.
    const late = targetOf({
      subject: 'late',
      label: 'Late',
      reminderAt: '2026-09-20T00:00:00.000Z',
    });
    expect(dueItemsOf([], [late, ...TARGETS], NOW).map((item) => item.title)).toEqual([
      'Late',
      'BOOZ ALLEN HAMILTON INC',
    ]);
    expect(dueItemsOf([], [], NOW)).toEqual([]);
  });
});
