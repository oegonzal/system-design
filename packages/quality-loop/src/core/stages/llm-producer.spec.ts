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
      setbacks: [],
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
      setbacks: [],
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
      setbacks: [],
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
      setbacks: [],
      memories: [],
    });
    expect(produced).toEqual({
      output: null,
      diagnostic: expect.objectContaining({ stage: 'producer', reason: 'llm-failed' }),
      model: 'test-model',
      issues: [],
      overruns: [],
    });
  });

  it('[QL-62] a reply the schema refused answers nothing, with every fault it was refused for — on the diagnostic as well', async () => {
    const produced = await createLlmProducer(
      definition.task,
      definition.producer,
      fakeLlm({ text: 7, parts: [] }),
    ).produce({
      contract,
      mode: 'initial',
      prior: null,
      remediations: [],
      refusals: [],
      setbacks: [],
      memories: [],
    });
    expect(produced.output).toBeNull();
    expect(produced.issues).toEqual([
      expect.objectContaining({ path: 'text', code: 'invalid_type', soft: false }),
    ]);
    expect(produced.diagnostic).toEqual({
      stage: 'producer',
      sample: null,
      reason: 'llm-failed',
      detail: null,
      facts: { issues: produced.issues },
    });
  });

  it('[QL-62] is told why its last reply was refused under its own heading, apart from what a validator refused', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ text: 'new', parts: [] }).withRecorder((call) => calls.push(call));
    await createLlmProducer(definition.task, definition.producer, llm).produce({
      contract,
      mode: 'revise',
      prior,
      remediations: [],
      refusals: [
        {
          subject: { schema: 'parts[0]' },
          action: 'retry',
          severity: 'critical',
          targetRefs: [],
          note: 'parts[0]: Invalid input: expected string, received number',
        },
        {
          subject: { validator: 'references' },
          action: 'retry',
          severity: 'critical',
          targetRefs: [],
          note: 'cites c9, which the goal never listed',
        },
      ],
      setbacks: [],
      memories: [],
    });
    const { user } = calls[0];
    const reply = user.indexOf(
      '# Why your previous reply was refused before any judge read it — do not repeat these',
    );
    const revision = user.indexOf(
      '# Why your previous revision was refused before any judge read it — do not repeat these',
    );
    expect(reply).toBeGreaterThan(-1);
    expect(revision).toBeGreaterThan(reply);
    expect(user.slice(reply, revision)).toContain(
      '- [critical] parts[0]: Invalid input: expected string, received number',
    );
    expect(user.slice(revision)).toContain('- [critical] cites c9, which the goal never listed');
  });

  it("[QL-56] is told what its last attempt was found wrong with under its own heading, without that attempt's refs, only when it consumes setbacks", async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ text: 'new', parts: [] }).withRecorder((call) => calls.push(call));
    const input = {
      contract,
      mode: 'revise' as const,
      prior,
      remediations: [
        {
          subject: { finding: 'gap|text' },
          action: 'revise' as const,
          severity: 'medium' as const,
          targetRefs: ['text'],
          note: 'say more',
        },
      ],
      refusals: [],
      setbacks: [
        {
          subject: { finding: 'wrong|part.2' },
          action: 'revise' as const,
          severity: 'high' as const,
          targetRefs: ['part.2'],
          note: 'the second part contradicts the text',
        },
      ],
      memories: [],
    };
    const heading =
      '# Your last attempt was judged and did not beat the best — its defects; do not repeat them';

    await createLlmProducer(definition.task, definition.producer, llm).produce(input);
    expect(calls[0].user).not.toContain(heading);
    expect(calls[0].user).not.toContain('contradicts');

    await createLlmProducer(
      definition.task,
      { ...definition.producer, consumes: ['criteria', 'setbacks'] },
      llm,
    ).produce(input);
    const { user } = calls[1];
    const at = user.indexOf(heading);
    // After what to fix in the best, before the instruction; the attempt's
    // refs point into an artifact the prompt does not show, so none is given.
    expect(at).toBeGreaterThan(user.indexOf('# Remediations to apply'));
    expect(user.indexOf('# Instructions')).toBeGreaterThan(at);
    expect(user.slice(at)).toContain('- [high] the second part contradicts the text\n');
    expect(user).not.toContain('part.2');
    expect(user).toContain('- [medium] say more (at: text)');

    await createLlmProducer(
      definition.task,
      { ...definition.producer, consumes: ['criteria', 'setbacks'] },
      llm,
    ).produce({ ...input, setbacks: [] });
    expect(calls[2].user).not.toContain(heading);
  });
});
