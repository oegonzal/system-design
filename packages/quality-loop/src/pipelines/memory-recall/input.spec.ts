import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES } from '../../core/prompting';
import { goalBytes, memoryQuerySchema, readIndex, renderGoal } from './input';
import { maximalQuery, sampleQuery } from './testing';

describe('the memory-recall input codec', () => {
  it('[QL-14] a composed goal round-trips: the index read back is the index written', () => {
    const query = sampleQuery();
    const goal = renderGoal(query);
    expect(goal).toContain(query.query);
    expect(goal).toContain('### [m1] finding · run');
    expect(goal).toContain('### [m3] lesson · run');
    expect(readIndex(goal)).toEqual({
      pipeline: 'memory-recall',
      maxKept: 2,
      candidates: query.candidates.map((candidate, position) => ({
        alias: `m${position + 1}`,
        source: candidate.source,
      })),
    });
  });

  it('[QL-14] a plain prompt, a foreign index or a broken fence reads as no index', () => {
    expect(readIndex('# Prompt — Serve an order history\n\nJust a prompt.')).toBeNull();
    expect(readIndex('## Index\n\n```json\n{"pipeline":"other","x":1}\n```')).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
    expect(readIndex('```json\n{"pipeline":"memory-recall"}')).toBeNull();
  });

  it('[QL-14] the input schema is the byte budget: a maximal query renders under the goal cap', () => {
    const query = maximalQuery();
    expect(memoryQuerySchema.safeParse(query).success).toBe(true);
    const goal = renderGoal(query);
    expect(goalBytes(goal)).toBeLessThan(GOAL_MAX_BYTES);
    expect(readIndex(goal)?.candidates).toHaveLength(query.candidates.length);
  });
});
