import { describe, expect, it } from 'vitest';

import { ClaudeAgentLlmClient } from './claude-agent-client';
import { answer, ONCE, said, succeeded } from './testing';
import type { ClaudeQuery } from './claude-account';
import type { LlmCall } from './exchange';
import { DEFAULT_RETRY_POLICY } from './llm-failure';
import { SALVAGED, TIMED_OUT } from './structured-reply';

describe('the subscription client under its time limit', () => {
  /** Milliseconds, not minutes: a token a millisecond, no overhead or minimum, a short grace. */
  const fast = { overheadMs: 0, floorTokensPerSecond: 1_000, minimumMs: 0, graceMs: 40 };
  const clock = { tickMs: 2 };

  /** A stream that says nothing, and ends only as `ending` does — or never. */
  const silentUntil = (ending: Promise<never>): AsyncIterable<never> => ({
    [Symbol.asyncIterator]: () => ({ next: () => ending }),
  });

  /** A turn that writes nothing until it is aborted, then dies as the SDK reports an abort: a plain Error. */
  const wedged = () => {
    let calls = 0;
    const run = ((params: { options?: { abortController?: AbortController } }) => {
      calls += 1;
      const signal = params.options?.abortController?.signal;
      return silentUntil(
        new Promise<never>((_, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new Error('Claude Code process aborted by user')),
          ),
        ),
      );
    }) as unknown as ClaudeQuery;
    return { run, calls: () => calls };
  };

  it('[QL-33] a turn our abort ended is a timeout, however the SDK names its error, and is asked again once — not twice', async () => {
    const recorded: LlmCall[] = [];
    const turn = wedged();
    const answered = await new ClaudeAgentLlmClient({ query: turn.run, limits: fast, clock })
      .withRecorder((call) => recorded.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 20 });

    expect(answered).toBeNull();
    expect(turn.calls()).toBe(DEFAULT_RETRY_POLICY.timeoutAttempts);
    expect(recorded.map((call) => [call.attempt, call.outcome, call.error?.name])).toEqual([
      [1, 'error', TIMED_OUT],
      [2, 'error', TIMED_OUT],
    ]);
    // The record says which limit, from what the call declared.
    expect(recorded[0]?.error?.message).toContain('20 declared tokens');
    expect(recorded[0]?.error?.message).toContain('process aborted by user');
  });

  it('[QL-59] a turn our limit ended answers ok, salvaged, when what it streamed holds the whole object', async () => {
    // The object arrives, then the stream hangs until the abort kills it.
    const spoke = ((params: { options?: { abortController?: AbortController } }) => {
      const signal = params.options?.abortController?.signal;
      return (async function* () {
        yield said('m-1', '{"answer":"whole"}');
        await new Promise<never>((_, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new Error('Claude Code process aborted by user')),
          ),
        );
      })();
    }) as unknown as ClaudeQuery;
    const recorded: LlmCall[] = [];
    const answered = await new ClaudeAgentLlmClient({ query: spoke, limits: fast, clock })
      .withRecorder((call) => recorded.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 20 });

    expect(answered).toEqual({ answer: 'whole' });
    // One attempt: the value was read, so there was nothing to ask again.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      outcome: 'ok',
      response: { answer: 'whole' },
      text: '{"answer":"whole"}',
      error: { name: SALVAGED, message: expect.stringContaining(`${TIMED_OUT}: no answer within`) },
      salvage: { from: 'transcript', overruns: [], issues: [] },
      apiCalls: 1,
    });
  });

  it('[QL-33] a turn that ignores its abort is abandoned a grace after its limit, never awaited past it', async () => {
    const recorded: LlmCall[] = [];
    const deaf = (() => silentUntil(new Promise<never>(() => undefined))) as unknown as ClaudeQuery;
    const began = Date.now();
    const answered = await new ClaudeAgentLlmClient({
      query: deaf,
      limits: fast,
      clock,
      retry: ONCE,
    })
      .withRecorder((call) => recorded.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 20 });

    expect(answered).toBeNull();
    // Its limit (20 ms) and grace (40 ms), with room for the ticks — not forever.
    expect(Date.now() - began).toBeLessThan(1_000);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      outcome: 'error',
      error: { name: TIMED_OUT, message: expect.stringContaining('did not end') },
    });
  });

  it('[QL-33] the limit is what the call declares: the same slow answer fits a large declaration and not a small one', async () => {
    // An answer that takes 60 ms: a 1,000-token declaration is a second, a 10-token one is 10 ms.
    const slow = ((params: { options?: { abortController?: AbortController } }) => {
      const signal = params.options?.abortController?.signal;
      return (async function* () {
        await new Promise((wake) => setTimeout(wake, 60));
        if (signal?.aborted) throw new Error('Claude Code process aborted by user');
        yield succeeded('{"answer":"slow"}');
      })();
    }) as unknown as ClaudeQuery;
    const client = new ClaudeAgentLlmClient({ query: slow, limits: fast, clock, retry: ONCE });

    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 1_000 }),
    ).resolves.toEqual({ answer: 'slow' });
    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 10 }),
    ).resolves.toBeNull();
  });
});
