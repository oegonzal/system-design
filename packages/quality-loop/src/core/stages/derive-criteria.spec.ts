import type { LlmCall } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { fakeLlm, tinyPipeline } from '../testing';
import { createCriteriaDeriver } from './derive-criteria';

const { task, deriveCriteria } = tinyPipeline();

describe('createCriteriaDeriver', () => {
  it('[QL-2] a completion the model fails is llm-failed and no criteria — never an invented rubric', async () => {
    const derived = await createCriteriaDeriver(task, deriveCriteria, fakeLlm())('goal');
    expect(derived).toEqual({
      criteria: null,
      diagnostic: expect.objectContaining({ stage: 'criteria', reason: 'llm-failed' }),
    });
  });

  it('[QL-2] assigns positional ids and hands the goal to the model verbatim', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({
      criteria: [
        { kind: 'nice', statement: ' b ' },
        { kind: 'must', statement: 'a' },
      ],
    }).withRecorder((call) => calls.push(call));
    const derived = await createCriteriaDeriver(
      task,
      deriveCriteria,
      llm,
    )('# The goal\n\nExactly this.');
    expect(derived.criteria).toEqual([
      { id: 'c1', kind: 'nice', statement: 'b' },
      { id: 'c2', kind: 'must', statement: 'a' },
    ]);
    expect(calls[0].user).toContain('# The goal\n\nExactly this.');
    expect(calls[0].system).toContain(deriveCriteria.persona);
  });

  it('[QL-2] a refusal is a diagnostic, not evidence', async () => {
    const derived = await createCriteriaDeriver(task, deriveCriteria, fakeLlm())('goal');
    expect(derived).toEqual({
      criteria: null,
      diagnostic: expect.objectContaining({ reason: 'llm-failed' }),
    });
  });
});
