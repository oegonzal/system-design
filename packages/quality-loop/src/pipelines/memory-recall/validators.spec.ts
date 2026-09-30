import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { contractOf } from '../../core/testing';
import { MEMORY_RECALL } from './definition';
import { renderGoal } from './input';
import type { MemoryPack } from './output';
import { samplePack, sampleQuery } from './testing';
import { limitsValidator, referencesValidator } from './validators';

const contract = (goal = renderGoal(sampleQuery())): TaskContract<MemoryPack> =>
  contractOf(MEMORY_RECALL.task, goal);

const messages = (artifact: MemoryPack, goal?: string) => ({
  references: referencesValidator.validate(artifact, contract(goal)).problems.map((p) => p.message),
  limits: limitsValidator.validate(artifact, contract(goal)).problems.map((p) => p.message),
});

describe('the memory-recall validators', () => {
  it('[QL-3] a pack with one verdict per listed candidate passes both', () => {
    expect(messages(samplePack())).toEqual({ references: [], limits: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('block');
  });

  it('[QL-3] an alias that was never recalled, or judged twice, blocks', () => {
    const unknown = samplePack({ dropped: [{ chunk: 'm9', reason: 'made up' }] });
    expect(messages(unknown).references).toEqual(['m9 is not a listed candidate']);
    const twice = samplePack({
      dropped: [
        { chunk: 'm1', reason: 'also dropped' },
        { chunk: 'm3', reason: 'unrelated' },
      ],
    });
    expect(messages(twice).references).toEqual(['m1 is given more than one verdict']);
    expect(referencesValidator.validate(twice, contract()).problems[0].locationRefs).toEqual([
      'm1',
    ]);
  });

  it('[QL-3] a candidate left without a verdict, or a pack over its limit, blocks', () => {
    const silent = samplePack({ dropped: [] });
    expect(messages(silent).limits).toEqual(['m3 has no verdict']);
    const over = samplePack({
      kept: [
        ...samplePack().kept,
        { chunk: 'm3', serves: 'nothing', insight: 'dedupe by event id', caveat: null },
      ],
      dropped: [],
    });
    expect(messages(over).limits).toEqual(['3 chunks kept; the limit is 2']);
  });

  it('[QL-3] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    const plain = 'Just a prompt, no candidates.';
    expect(messages(samplePack(), plain)).toEqual({
      references: ['the goal carries no memory-recall index'],
      limits: [],
    });
    const broken = { summary: 'x' } as unknown as MemoryPack;
    expect(messages(broken)).toEqual({ references: [], limits: [] });
  });
});
