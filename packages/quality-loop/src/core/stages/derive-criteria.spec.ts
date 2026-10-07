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
      overruns: [],
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
    // Every stage is told the truth about its bounds: a size is an ask, and a
    // structural fault is named before it is asked again.
    expect(calls[0].system).toContain('Each maxLength and maxItems is the size asked for');
    expect(calls[0].system).toContain('you will be asked again with the fault named');
    expect(calls[0].system).not.toMatch(/discarded|never cut to fit/);
  });

  it('[QL-2] [QL-59] [QL-47] a reply with one statement past the task’s ceiling keeps its whole rubric — the seam keeps the statement and the stage reports it as an overrun', async () => {
    // The live failure this pins: a deriver that wrote 751 characters into
    // one of sixteen statements lost all sixteen, three attempts running.
    // The fake reads a reply as the seam does, so the statement is kept whole.
    const { target, ceiling } = criterionLengthBound(task);
    const long = 'x'.repeat(ceiling + 1);
    const reply = {
      criteria: [
        { kind: 'must', statement: 'short enough' },
        { kind: 'must', statement: long },
      ],
    };
    const calls: LlmCall[] = [];
    const llm = fakeLlm(reply).withRecorder((call) => calls.push(call));
    const derived = await createCriteriaDeriver(task, deriveCriteria, llm)('goal');
    const overrun = { path: 'criteria[1].statement', target, ceiling, actual: ceiling + 1 };
    expect(derived).toEqual({
      criteria: [
        { id: 'c1', kind: 'must', statement: 'short enough' },
        { id: 'c2', kind: 'must', statement: long },
      ],
      diagnostic: null,
      overruns: [expect.objectContaining({ ...overrun, handling: 'kept-over-ceiling' })],
    });
    expect(calls[0]?.salvage?.overruns).toMatchObject([overrun]);
  });

  it('[QL-2] fixed criteria head the rubric with the first ids, the deriver is told they are already there, and derives into what remains', async () => {
    // A cap a goal's own lines fill crowds out whatever the deriver was also
    // asked for. Measured 2026-10-07: a kind one pipeline declared never once
    // appeared in 165 derived rubrics. Declared, it cannot be crowded out.
    const fixed = [
      { kind: 'nice', statement: 'The text reads as one voice.' },
      { kind: 'nice', statement: 'Every part names its subject.' },
    ];
    const withFixed = { ...task, maxCriteria: 4, fixedCriteria: fixed };
    const calls: LlmCall[] = [];
    const llm = fakeLlm({
      criteria: [
        { kind: 'must', statement: 'a' },
        { kind: 'must', statement: 'b' },
        { kind: 'must', statement: 'past the room' },
      ],
    }).withRecorder((call) => calls.push(call));
    const derived = await createCriteriaDeriver(withFixed, deriveCriteria, llm)('goal');
    expect(derived.criteria).toEqual([
      { id: 'c1', kind: 'nice', statement: 'The text reads as one voice.' },
      { id: 'c2', kind: 'nice', statement: 'Every part names its subject.' },
      { id: 'c3', kind: 'must', statement: 'a' },
      { id: 'c4', kind: 'must', statement: 'b' },
    ]);
    // Told what is already on the checklist, and asked for only the room left.
    expect(calls[0].user).toContain('# Criteria already on the checklist');
    expect(calls[0].user).toContain('- [nice] The text reads as one voice.');
    expect(JSON.stringify(calls[0].schema)).toContain('"maxItems":2');

    // A pipeline with none declared says nothing about them.
    const plain = fakeLlm({ criteria: [{ kind: 'must', statement: 'a' }] }).withRecorder((call) =>
      calls.push(call),
    );
    await createCriteriaDeriver(task, deriveCriteria, plain)('goal');
    expect(calls[1].user).not.toContain('already on the checklist');
  });

  it('[QL-2] a refusal is a diagnostic, not evidence — and it keeps the faults the schema refused', async () => {
    const derived = await createCriteriaDeriver(task, deriveCriteria, fakeLlm())('goal');
    expect(derived).toEqual({
      criteria: null,
      diagnostic: expect.objectContaining({ reason: 'llm-failed' }),
      overruns: [],
    });

    const refused = await createCriteriaDeriver(
      task,
      deriveCriteria,
      fakeLlm({ criteria: [{ kind: 'bogus', statement: 'a' }] }),
    )('goal');
    expect(refused.criteria).toBeNull();
    expect(refused.diagnostic?.facts?.issues).toEqual([
      expect.objectContaining({ path: 'criteria[0].kind', soft: false }),
    ]);
  });
});
