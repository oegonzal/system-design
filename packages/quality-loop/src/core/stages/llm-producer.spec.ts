import type { LlmCall } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { criterion, fakeLlm, tinyPipeline, type TinyOutput } from '../testing';
import { createLlmProducer } from './llm-producer';
import { MEMORIES_HEADING } from './prompting';

const definition = tinyPipeline();
const contract = { ...definition.task, goal: 'make a thing', criteria: [criterion('c1')] };
const prior: TinyOutput = { text: 'old', parts: ['p'] };

describe('createLlmProducer', () => {
  it('[QL-9] on revise it sees the prior artifact and the remediation notes, never a score', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ text: 'new', parts: [] }).withRecorder((call) => calls.push(call));
    const produced = await createLlmProducer(definition.task, definition.producer, llm).produce({
      contract,
      mode: 'revise',
      prior,
      remediations: [
        {
          subject: { finding: 'gap|text' },
          action: 'revise',
          severity: 'medium',
          targetRefs: ['text'],
          note: 'say more',
        },
      ],
      refusals: [],
      memories: [],
    });
    expect(produced.output).toEqual({ text: 'new', parts: [] });
    expect(calls[0].user).toContain('[text] old');
    expect(calls[0].user).toContain('[medium] say more (at: text)');
    expect(calls[0].user).not.toMatch(/score|overall/);
  });

  it('[QL-9] is briefed with the derived criteria only when it declares it consumes them', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ text: 'new', parts: [] }).withRecorder((call) => calls.push(call));
    const input = {
      contract,
      mode: 'initial' as const,
      prior: null,
      remediations: [],
      refusals: [],
      memories: [],
    };
    await createLlmProducer(definition.task, { ...definition.producer, consumes: [] }, llm).produce(
      input,
    );
    expect(calls[0].user).toContain('# Goal');
    expect(calls[0].user).not.toContain('# Success criteria');
    await createLlmProducer(definition.task, definition.producer, llm).produce(input);
    expect(calls[1].user).toContain('# Success criteria');
  });

  it('[QL-32] is briefed with memories under their advisory heading only when it consumes them and was handed some', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ text: 'new', parts: [] }).withRecorder((call) => calls.push(call));
    const memories = [{ ref: 'm1', text: 'Cache the read path before sharding it.' }];
    const input = {
      contract,
      mode: 'revise' as const,
      prior,
      remediations: [],
      refusals: [],
      memories,
    };
    const consuming = { ...definition.producer, consumes: ['criteria', 'memories'] as const };
    await createLlmProducer(definition.task, consuming, llm).produce(input);
    expect(calls[0].user).toContain(MEMORIES_HEADING);
    expect(calls[0].user).toContain('- [m1] Cache the read path before sharding it.');
    // The lessons sit after the rubric and before what to fix: context, not a remediation.
    const at = (text: string) => calls[0].user.indexOf(text);
    expect(at('# Success criteria')).toBeLessThan(at(MEMORIES_HEADING));
    expect(at(MEMORIES_HEADING)).toBeLessThan(at('# Your previous artifact'));

    await createLlmProducer(definition.task, consuming, llm).produce({ ...input, memories: [] });
    await createLlmProducer(definition.task, definition.producer, llm).produce(input);
    for (const call of calls.slice(1)) {
      expect(call.user).not.toContain(MEMORIES_HEADING);
      expect(call.user).not.toContain('sharding');
    }
  });

  it('[QL-9] a failed completion is a diagnostic', async () => {
    const produced = await createLlmProducer(
      definition.task,
      definition.producer,
      fakeLlm(),
    ).produce({
      contract,
      mode: 'initial',
      prior: null,
      remediations: [],
      refusals: [],
      memories: [],
    });
    expect(produced).toEqual({
      output: null,
      diagnostic: expect.objectContaining({ stage: 'producer', reason: 'llm-failed' }),
      model: 'test-model',
    });
  });
});
