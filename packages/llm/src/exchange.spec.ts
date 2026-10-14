import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { asRecordable, recorderFor, type LlmCall } from './exchange';
import type { LlmClient, StructuredRequest } from './llm-client';

const schema = z.strictObject({ answer: z.string() });
const ask: StructuredRequest<{ answer: string }> = {
  system: 'be brief',
  user: 'the ask',
  schema,
  maxTokens: 500,
};

/** A client with no record of its own — every hand-rolled double, and any adapter yet to be written. */
const plain = (answer: { answer: string } | null): LlmClient => ({
  model: 'some/model',
  // A double answers its one fixed reply whatever the call asks it to parse.
  completeStructured: <T>() => Promise.resolve(answer as T | null),
});

describe('recording is the seam’s, not the adapter’s', () => {
  it('[QL-62] a client that reports nothing of its own is still recorded, so a dump never depends on which provider served it', async () => {
    const calls: LlmCall[] = [];
    // It offers no capability of its own…
    expect(asRecordable(plain({ answer: 'yes' }))).toBeNull();
    // …and is recorded anyway.
    const recorded = recorderFor(plain({ answer: 'yes' })).withRecorder((call) => calls.push(call));
    expect(await recorded.completeStructured(ask)).toEqual({ answer: 'yes' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: 'some/model',
      system: 'be brief',
      user: 'the ask',
      outcome: 'ok',
      response: { answer: 'yes' },
      error: null,
    });
    // The schema it was asked against is recorded as JSON, never the zod object.
    expect(JSON.stringify(calls[0]!.schema)).toContain('answer');
    expect(calls[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('[QL-62] records a call that produced nothing, and one that threw, rather than leaving the dump silent', async () => {
    const misses: LlmCall[] = [];
    await recorderFor(plain(null))
      .withRecorder((call) => misses.push(call))
      .completeStructured(ask);
    expect(misses[0]).toMatchObject({ outcome: 'schema-miss', response: null });
    expect(misses[0]!.error?.name).toBe('NoValue');

    const thrown: LlmCall[] = [];
    const broken: LlmClient = {
      model: 'some/model',
      completeStructured: () => Promise.reject(new Error('transport died')),
    };
    await expect(
      recorderFor(broken)
        .withRecorder((call) => thrown.push(call))
        .completeStructured(ask),
    ).rejects.toThrow('transport died');
    // The throw still reaches the caller; the record is made on the way past.
    expect(thrown[0]).toMatchObject({ outcome: 'error' });
    expect(thrown[0]!.error?.message).toBe('transport died');
  });

  it('[QL-62] an adapter that knows more about its own turn keeps saying so', async () => {
    const own = { withRecorder: () => plain({ answer: 'rich' }) };
    const client = Object.assign(plain({ answer: 'rich' }), own);
    // Its own recorder is used rather than the port-level wrapper.
    expect(recorderFor(client)).toBe(client);
  });
});
