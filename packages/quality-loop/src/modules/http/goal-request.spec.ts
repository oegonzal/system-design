import { GOAL_BUDGET_BYTES, textBytes } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { criteriaRequestSchema } from '../runs/criteria-request';
import { goalRequestSchema } from './goal-request';

describe('a goal at the edge', () => {
  // Three bytes a character: a character cap of the same number passed a
  // goal three times what any stage reads, which the engine then clipped.
  const wide = '€';
  const atBudget = wide.repeat(Math.floor(GOAL_BUDGET_BYTES / textBytes(wide)));
  const pastBudget = `${atBudget}${wide}`;

  it('is held to the bytes a stage reads, not to as many characters', () => {
    expect(pastBudget.length).toBeLessThan(GOAL_BUDGET_BYTES);
    const readers = [
      (goal: string) => goalRequestSchema.safeParse({ goal }),
      (goal: string) => criteriaRequestSchema.safeParse({ pipeline: 'tiny', goal }),
    ];
    for (const read of readers) {
      expect(read(atBudget).success).toBe(true);
      const refused = read(pastBudget);
      expect(refused.success).toBe(false);
      expect(refused.error?.issues[0]?.message).toContain(`${GOAL_BUDGET_BYTES} bytes`);
      expect(read('').success).toBe(false);
    }
  });
});
