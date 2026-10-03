import type { LlmCall } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { bound } from '@sysdesign/contracts';

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

  it('[QL-2] a reply with one statement past the task’s ceiling is refused whole by a strict client — and is llm-failed', async () => {
    // The live failure this pins: a deriver that wrote 751 characters into
    // one of sixteen statements lost all sixteen, three attempts running.
    // The ceiling is what the fake client, which parses strictly, refuses at.
    const { ceiling } = criterionLengthBound(task);
    const reply = {
      criteria: [
        { kind: 'must', statement: 'short enough' },
        { kind: 'must', statement: 'x'.repeat(ceiling + 1) },
      ],
    };
    const derived = await createCriteriaDeriver(task, deriveCriteria, fakeLlm(reply))('goal');
    expect(derived).toEqual({
      criteria: null,
      diagnostic: expect.objectContaining({ stage: 'criteria', reason: 'llm-failed' }),
    });

    // The same reply, to a pipeline that declares room for it, is a rubric.
    const roomy = { ...task, statementBound: bound(ceiling * 2) };
    const fitted = await createCriteriaDeriver(roomy, deriveCriteria, fakeLlm(reply))('goal');
    expect(fitted.criteria?.map((criterion) => criterion.statement.length)).toEqual([
      'short enough'.length,
      ceiling + 1,
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
