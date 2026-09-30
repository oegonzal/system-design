import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { contractOf } from '../../core/testing';
import { fromRun } from './from-run';
import { EXPERIENCE_DIGEST } from './definition';
import { renderGoal } from './input';
import type { ExperienceDigest } from './output';
import { sampleDigest, sampleRun } from './testing';
import { limitsValidator, referencesValidator } from './validators';

const composedGoal = (): string => {
  const record = fromRun(sampleRun());
  if (record === null) throw new Error('the sample run must compose');
  return renderGoal(record);
};

const contract = (goal = composedGoal()): TaskContract<ExperienceDigest> =>
  contractOf(EXPERIENCE_DIGEST.task, goal);

const messages = (artifact: ExperienceDigest, goal?: string) => ({
  references: referencesValidator.validate(artifact, contract(goal)).problems.map((p) => p.message),
  limits: limitsValidator.validate(artifact, contract(goal)).problems.map((p) => p.message),
});

describe('the experience-digest validators', () => {
  it('[QL-3] a digest that places every listed alias once passes both', () => {
    expect(messages(sampleDigest())).toEqual({ references: [], limits: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('block');
  });

  it('[QL-3] evidence the record never held, or placed twice, blocks', () => {
    const unknown = sampleDigest({ unused: ['f2', 'r2', 'f9'] });
    expect(messages(unknown).references).toEqual(['f9 is not listed evidence']);
    const twice = sampleDigest({ unused: ['f1', 'f2', 'r2'] });
    expect(messages(twice).references).toEqual(['f1 is placed more than once']);
  });

  it('[QL-3] evidence left unplaced, or more memories than the limit, blocks', () => {
    expect(messages(sampleDigest({ unused: ['f2'] })).limits).toEqual([
      'r2 is neither used nor listed as unused',
    ]);
    const memory = sampleDigest().memories[0];
    const goal = composedGoal().replace('"maxMemories":8', '"maxMemories":1');
    const over = sampleDigest({
      memories: [memory, { ...memory, evidence: ['f2'] }],
      unused: ['r2'],
    });
    expect(messages(over, goal).limits).toEqual(['2 memories proposed; the limit is 1']);
  });

  it('[QL-3] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    expect(messages(sampleDigest(), 'Just a prompt.')).toEqual({
      references: ['the goal carries no experience-digest index'],
      limits: [],
    });
    const broken = { summary: 'x' } as unknown as ExperienceDigest;
    expect(messages(broken)).toEqual({ references: [], limits: [] });
  });
});
