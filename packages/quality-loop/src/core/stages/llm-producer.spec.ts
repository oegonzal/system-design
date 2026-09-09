import type { LlmCall } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { criterion, fakeLlm, tinyPipeline, type TinyOutput } from '../testing';
import { createLlmProducer } from './llm-producer';

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
    });
    expect(produced.output).toEqual({ text: 'new', parts: [] });
    expect(calls[0].user).toContain('[text] old');
    expect(calls[0].user).toContain('[medium] say more (at: text)');
    expect(calls[0].user).not.toMatch(/score|overall/);
  });

  it('[QL-9] is briefed with the derived criteria only when it declares it consumes them', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ text: 'new', parts: [] }).withRecorder((call) => calls.push(call));
    const input = { contract, mode: 'initial' as const, prior: null, remediations: [] };
    await createLlmProducer(definition.task, { ...definition.producer, consumes: [] }, llm).produce(
      input,
    );
    expect(calls[0].user).toContain('# Goal');
    expect(calls[0].user).not.toContain('# Success criteria');
    await createLlmProducer(definition.task, definition.producer, llm).produce(input);
    expect(calls[1].user).toContain('# Success criteria');
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
    });
    expect(produced).toEqual({
      output: null,
      diagnostic: expect.objectContaining({ stage: 'producer', reason: 'llm-failed' }),
      model: 'test-model',
    });
  });
});
