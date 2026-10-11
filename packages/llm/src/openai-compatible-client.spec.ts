import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { LlmCall } from './exchange';
import type { LlmClient } from './llm-client';
import { DEFAULT_RETRY_POLICY } from './llm-failure';
import {
  failureForStatus,
  OpenAiCompatibleLlmClient,
  SCHEMA_NAME,
  type HttpTransport,
} from './openai-compatible-client';

const schema = z.strictObject({ answer: z.string().max(40), score: z.number().int() });

/** A chat-completions reply, in that shape's own spelling of ids and tokens. */
const replied = (content: string, status = 200, id = 'chatcmpl-1'): Response =>
  new Response(
    JSON.stringify({
      id,
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }),
    { status },
  );

/** A responses reply, in that shape's: an output list to search, and input/output tokens. */
const answered = (text: string, status = 200, id = 'resp_1'): Response =>
  new Response(
    JSON.stringify({
      id,
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
      usage: { input_tokens: 11, output_tokens: 3 },
    }),
    { status },
  );

/** A transport that answers from a script and records what it was asked. */
const scripted = (...replies: Response[]) => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  let next = 0;
  const send: HttpTransport = (url, init) => {
    sent.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return Promise.resolve(replies[Math.min(next++, replies.length - 1)]);
  };
  return { send, sent };
};

const client = (send: HttpTransport, options = {}) =>
  new OpenAiCompatibleLlmClient({
    fetch: send,
    sleep: () => Promise.resolve(),
    model: 'gpt-4o-mini',
    ...options,
  });

describe('an OpenAI-compatible provider', () => {
  it('[QL-62] leaves the keywords its config says the endpoint cannot take out of the schema it sends, and still holds the reply to them', async () => {
    // Measured 2026-10-08: Ollama 0.33.1 refused the step plan's string length
    // caps as a grammar; left out, it answered, and the zod parse still reads
    // a reply past the ceiling as the size fault it is.
    const { send, sent } = scripted(replied('{"answer":"ok","score":1}'));
    await client(send, { omitKeywords: ['maxLength'] }).completeStructured({
      system: 's',
      user: 'u',
      schema,
    });
    const body = sent[0]?.body as {
      response_format: { json_schema: { schema: Record<string, unknown> } };
    };
    expect(JSON.stringify(body.response_format.json_schema.schema)).not.toContain('maxLength');
    // The default sends every keyword.
    const { send: full, sent: fullSent } = scripted(replied('{"answer":"ok","score":1}'));
    await client(full).completeStructured({ system: 's', user: 'u', schema });
    expect(JSON.stringify(fullSent[0]?.body)).toContain('"maxLength":40');
  });

  it('[QL-62] asks for the schema by the endpoint’s own field, in strict mode, and returns the validated object', async () => {
    const { send, sent } = scripted(replied('{"answer":"ok","score":7}'));
    const value = await client(send).completeStructured({
      system: 's',
      user: 'u',
      schema,
      maxTokens: 500,
    });
    expect(value).toEqual({ answer: 'ok', score: 7 });

    const body = sent[0]!.body as {
      response_format: {
        type: string;
        json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
      };
      messages: { role: string; content: string }[];
    };
    expect(sent[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe(SCHEMA_NAME);
    // The schema it carries is the declared one: the endpoint enforces the
    // bounds, so sending them is what makes strict mode worth asking for.
    expect(JSON.stringify(body.response_format.json_schema.schema)).toContain('maxLength');
    expect(body.response_format.json_schema.schema['additionalProperties']).toBe(false);
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('[QL-62] reads a reply the same way the other provider does, so a model that fences or narrates is still read', async () => {
    const { send } = scripted(replied('Here you go:\n```json\n{"answer":"ok","score":7}\n```\n'));
    expect(await client(send).completeStructured({ system: 's', user: 'u', schema })).toEqual({
      answer: 'ok',
      score: 7,
    });
  });

  it('[QL-62] retries a miss naming what broke, and gives up with the faults rather than inventing an answer', async () => {
    const { send, sent } = scripted(
      replied('{"answer":"ok"}'),
      replied('{"answer":"ok","score":7}'),
    );
    const reply = await client(send, {
      retry: { ...DEFAULT_RETRY_POLICY, attempts: 2 },
    }).completeStructuredDetailed({ system: 's', user: 'u', schema });
    expect(reply.value).toEqual({ answer: 'ok', score: 7 });
    // The second ask named the first reply's fault.
    const second = sent[1]!.body as { messages: { content: string }[] };
    expect(second.messages[1]!.content).toContain('refused');

    const { send: always } = scripted(replied('{"answer":"ok"}'));
    const lost = await client(always, {
      retry: { ...DEFAULT_RETRY_POLICY, attempts: 2 },
    }).completeStructuredDetailed({ system: 's', user: 'u', schema });
    expect(lost.value).toBeNull();
    expect(lost.issues.length).toBeGreaterThan(0);
  });

  it('[QL-62] reads an HTTP status as the seam’s own failure, and sends no key where none is configured', async () => {
    expect(failureForStatus(429)).toBe('rate-limited');
    expect(failureForStatus(401)).toBe('auth');
    expect(failureForStatus(400)).toBe('invalid-request');
    expect(failureForStatus(503)).toBe('overloaded');
    expect(failureForStatus(418)).toBe('invalid-request');

    // A local endpoint wants no Authorization header at all.
    let headers: Record<string, string> = {};
    const send: HttpTransport = (_url, init) => {
      headers = init.headers as Record<string, string>;
      return Promise.resolve(replied('{"answer":"ok","score":1}'));
    };
    await client(send, { apiKey: null, baseUrl: 'http://localhost:11434/v1' }).completeStructured({
      system: 's',
      user: 'u',
      schema,
    });
    expect(headers['Authorization']).toBeUndefined();
  });

  it('[QL-22] asks the declared API at its own path, in its own wording, and leaves the other alone', async () => {
    // Both shapes are asked for, so the table is the only thing that differs.
    const { send: chat, sent: chatSent } = scripted(replied('{"answer":"ok","score":1}'));
    await client(chat).completeStructured({ system: 's', user: 'u', schema, maxTokens: 500 });
    expect(chatSent[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(Object.keys(chatSent[0]!.body)).toContain('messages');

    const { send, sent } = scripted(answered('{"answer":"ok","score":1}'));
    const value = await client(send, { api: 'responses', store: true }).completeStructured({
      system: 's',
      user: 'u',
      schema,
      maxTokens: 500,
    });
    expect(value).toEqual({ answer: 'ok', score: 1 });

    const body = sent[0]!.body as {
      instructions: string;
      input: { role: string; content: string }[];
      max_output_tokens: number;
      store: boolean;
      text: { format: { type: string; name: string; strict: boolean } };
    };
    expect(sent[0]!.url).toBe('https://api.openai.com/v1/responses');
    // The system prompt is this shape's `instructions`, and the schema sits
    // flattened beside the format rather than nested under a `json_schema` key.
    expect(body.instructions).toBe('s');
    expect(body.input.map((part) => part.role)).toEqual(['user']);
    expect(body.max_output_tokens).toBe(500);
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      name: SCHEMA_NAME,
      strict: true,
    });
    expect(body).not.toHaveProperty('messages');
    expect(body).not.toHaveProperty('response_format');
    // Asked for, so the exchange is retained and findable in the provider's logs.
    expect(body.store).toBe(true);
  });

  it('[QL-22] finds the message in a reply rather than indexing it, so a reasoning model still answers', async () => {
    // Measured against both a hosted reasoning model and a local server
    // relaying one: `output[0]` is a reasoning item and the answer is behind
    // it, so reading position 0 would lose the reply on exactly the models
    // whose replies cost the most.
    const reasoningFirst = new Response(
      JSON.stringify({
        id: 'resp_1',
        status: 'completed',
        output: [
          { id: 'rs_1', type: 'reasoning', summary: [{ type: 'summary_text', text: 'thinking' }] },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '{"answer":"ok","score":4}' }],
          },
        ],
        usage: { input_tokens: 11, output_tokens: 3 },
      }),
      { status: 200 },
    );
    const { send } = scripted(reasoningFirst);
    expect(
      await client(send, { api: 'responses' }).completeStructured({
        system: 's',
        user: 'u',
        schema,
      }),
    ).toEqual({ answer: 'ok', score: 4 });
  });

  it('[QL-22] records the provider’s id for the exchange, and its tokens under either shape’s spelling', async () => {
    const calls: LlmCall[] = [];
    const recorded = (send: HttpTransport, options = {}): LlmClient =>
      (client(send, options) as OpenAiCompatibleLlmClient).withRecorder((call) => calls.push(call));

    // The chat shape spells its tokens prompt/completion and its id chatcmpl-.
    await recorded(
      scripted(replied('{"answer":"ok","score":1}', 200, 'chatcmpl-7')).send,
    ).completeStructured({ system: 's', user: 'u', schema });
    expect(calls[0]).toMatchObject({
      requestId: 'chatcmpl-7',
      usage: { inputTokens: 5, outputTokens: 2 },
    });

    // The responses shape spells them input/output and its id resp-. Same record.
    await recorded(scripted(answered('{"answer":"ok","score":1}')).send, {
      api: 'responses',
    }).completeStructured({ system: 's', user: 'u', schema });
    expect(calls[1]).toMatchObject({
      requestId: 'resp_1',
      usage: { inputTokens: 11, outputTokens: 3 },
    });

    // A refusal has no body to carry an id, so the header is what is kept.
    const refused = new Response('{"error":{"message":"nope"}}', {
      status: 429,
      headers: { 'x-request-id': 'req_abc' },
    });
    await recorded(scripted(refused).send, {
      retry: { ...DEFAULT_RETRY_POLICY, attempts: 1 },
    }).completeStructured({ system: 's', user: 'u', schema });
    expect(calls[2]).toMatchObject({ outcome: 'error', requestId: 'req_abc' });
  });

  it('[QL-62] a call the provider refuses says why: its reply carries the status and body its record keeps', async () => {
    const refused = new Response('{"error":{"message":"invalid key"}}', { status: 401 });
    const reply = await client(scripted(refused).send).completeStructuredDetailed({
      system: 's',
      user: 'u',
      schema,
    });
    expect(reply.value).toBeNull();
    expect(reply.cause).toBe('Http401: {"error":{"message":"invalid key"}}');
  });

  it('[QL-22] reads a reply cut at the token ceiling as this shape spells it', async () => {
    const cut = new Response(
      JSON.stringify({
        id: 'resp_2',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":"ok"' }] }],
        usage: { input_tokens: 9, output_tokens: 64 },
      }),
      { status: 200 },
    );
    const calls: LlmCall[] = [];
    await (
      client(scripted(cut).send, {
        api: 'responses',
        retry: { ...DEFAULT_RETRY_POLICY, attempts: 1 },
      }) as OpenAiCompatibleLlmClient
    )
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema });
    // `incomplete_details.reason` is this shape's `finish_reason`, and it is
    // what tells a reader the reply was truncated rather than refused.
    expect(calls[0]).toMatchObject({ outcome: 'schema-miss', stopReason: 'max_output_tokens' });
  });
});
