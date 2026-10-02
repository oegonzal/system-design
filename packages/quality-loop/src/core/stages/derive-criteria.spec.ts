import type { LlmCall } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { criterionLengthBound } from '../contracts';
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
    // Every stage is told the truth about its bounds: nothing it writes is cut to fit.
    expect(calls[0].system).toContain('never cut to fit');
  });

  it('[QL-2] a reply with one statement past the task’s bound is refused whole — never cut to fit — and is llm-failed', async () => {
    // The live failure this pins: a deriver that wrote 751 characters into
    // one of sixteen statements lost all sixteen, three attempts running.
    const bound = criterionLengthBound(task);
    const reply = {
      criteria: [
        { kind: 'must', statement: 'short enough' },
        { kind: 'must', statement: 'x'.repeat(bound + 1) },
      ],
    };
    const derived = await createCriteriaDeriver(task, deriveCriteria, fakeLlm(reply))('goal');
    expect(derived).toEqual({
      criteria: null,
      diagnostic: expect.objectContaining({ stage: 'criteria', reason: 'llm-failed' }),
    });

    // The same reply, to a pipeline that declares room for it, is a rubric.
    const roomy = { ...task, maxStatementLength: bound * 2 };
    const fitted = await createCriteriaDeriver(roomy, deriveCriteria, fakeLlm(reply))('goal');
    expect(fitted.criteria?.map((criterion) => criterion.statement.length)).toEqual([
      'short enough'.length,
      bound + 1,
    ]);
  });

  it('[QL-2] a refusal is a diagnostic, not evidence', async () => {
    const derived = await createCriteriaDeriver(task, deriveCriteria, fakeLlm())('goal');
    expect(derived).toEqual({
      criteria: null,
      diagnostic: expect.objectContaining({ reason: 'llm-failed' }),
    });
  });
});
