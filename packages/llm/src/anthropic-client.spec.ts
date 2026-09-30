import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AnthropicLlmClient } from './anthropic-client';
import { asRecordable, type LlmCall } from './exchange';

const schema = z.object({ verdict: z.string() });

/**
 * A stand-in for the SDK's one method. The adapter now takes its transport,
 * which is what makes every branch below reachable without a network — the
 * three failure modes it distinguishes were previously untestable.
 */
function fakeSdk(parse: () => unknown): Anthropic {
  return { messages: { parse: vi.fn(async () => parse()) } } as unknown as Anthropic;
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 45 },
    content: [{ type: 'text', text: '{"verdict":"sound"}' }],
    parsed_output: { verdict: 'sound' },
    _request_id: 'req_abc123',
    ...overrides,
  };
}

function record(sdk: Anthropic): { client: AnthropicLlmClient; calls: LlmCall[] } {
  const calls: LlmCall[] = [];
  const base = new AnthropicLlmClient({ client: sdk, model: 'claude-test' });
  const client = base.withRecorder((call) => calls.push(call)) as AnthropicLlmClient;
  return { client, calls };
}

describe('AnthropicLlmClient', () => {
  it('returns the parsed output and records the exchange', async () => {
    const { client, calls } = record(fakeSdk(() => message()));

    const result = await client.completeStructured({ system: 'sys', user: 'usr', schema });

    expect(result).toEqual({ verdict: 'sound' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: 'claude-test',
      system: 'sys',
      user: 'usr',
      outcome: 'ok',
      stopReason: 'end_turn',
      usage: { inputTokens: 120, outputTokens: 45 },
      requestId: 'req_abc123',
      text: '{"verdict":"sound"}',
      response: { verdict: 'sound' },
      error: null,
    });
  });

  /**
   * The regression this capability exists for: the port collapses all three
   * into `null`, so nothing downstream could ever say which one happened.
   */
  it('distinguishes refusal, schema miss and API error — all of which return null', async () => {
    const refusal = record(fakeSdk(() => message({ stop_reason: 'refusal', parsed_output: null })));
    const schemaMiss = record(fakeSdk(() => message({ parsed_output: null })));
    const apiError = record(
      fakeSdk(() => {
        throw new Error('529 overloaded');
      }),
    );

    for (const { client } of [refusal, schemaMiss, apiError]) {
      await expect(
        client.completeStructured({ system: 'sys', user: 'usr', schema }),
      ).resolves.toBeNull();
    }

    expect(refusal.calls[0]?.outcome).toBe('refusal');
    expect(schemaMiss.calls[0]?.outcome).toBe('schema-miss');
    expect(apiError.calls[0]?.outcome).toBe('error');
    expect(apiError.calls[0]?.error).toEqual({ name: 'Error', message: '529 overloaded' });
  });

  it('records the schema as JSON Schema, never the Zod instance', async () => {
    const { client, calls } = record(fakeSdk(() => message()));
    await client.completeStructured({ system: 'sys', user: 'usr', schema });

    // Survives a JSON round trip, which a Zod object graph does not.
    expect(() => JSON.stringify(calls[0])).not.toThrow();
    expect(calls[0]?.schema).toMatchObject({ type: 'object' });
  });

  it('records nothing when no recorder was attached', async () => {
    const sdk = fakeSdk(() => message());
    const client = new AnthropicLlmClient({ client: sdk, model: 'claude-test' });

    await expect(
      client.completeStructured({ system: 'sys', user: 'usr', schema }),
    ).resolves.toEqual({ verdict: 'sound' });
  });

  it('the recording twin shares the transport rather than opening another', async () => {
    const sdk = fakeSdk(() => message());
    const base = new AnthropicLlmClient({ client: sdk, model: 'claude-test' });

    await base.withRecorder(() => undefined).completeStructured({ system: 's', user: 'u', schema });
    await base.completeStructured({ system: 's', user: 'u', schema });

    expect(sdk.messages.parse).toHaveBeenCalledTimes(2);
  });

  it('honours the caller token ceiling and defaults it otherwise', async () => {
    const { client, calls } = record(fakeSdk(() => message()));

    await client.completeStructured({ system: 's', user: 'u', schema, maxTokens: 8192 });
    await client.completeStructured({ system: 's', user: 'u', schema });

    expect(calls.map((call) => call.maxTokens)).toEqual([8192, 4096]);
  });
});

describe('asRecordable', () => {
  it('offers recording for the real client and refuses it for a client that cannot record', () => {
    expect(
      asRecordable(new AnthropicLlmClient({ client: fakeSdk(() => message()) })),
    ).not.toBeNull();
    // A plain client has no calls to report.
    expect(
      asRecordable({ model: 'x', completeStructured: () => Promise.resolve(null) }),
    ).toBeNull();
  });
});
