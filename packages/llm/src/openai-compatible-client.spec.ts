import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DEFAULT_RETRY_POLICY } from './llm-failure';
import {
  failureForStatus,
  OpenAiCompatibleLlmClient,
  SCHEMA_NAME,
  type ChatTransport,
} from './openai-compatible-client';

const schema = z.strictObject({ answer: z.string().max(40), score: z.number().int() });

const replied = (content: string, status = 200): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

/** A transport that answers from a script and records what it was asked. */
const scripted = (...replies: Response[]) => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  let next = 0;
  const send: ChatTransport = (url, init) => {
    sent.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return Promise.resolve(replies[Math.min(next++, replies.length - 1)]);
  };
  return { send, sent };
};

const client = (send: ChatTransport, options = {}) =>
  new OpenAiCompatibleLlmClient({
    fetch: send,
    sleep: () => Promise.resolve(),
    model: 'gpt-4o-mini',
    ...options,
  });

describe('an OpenAI-compatible provider', () => {
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
    // The schema it carries is the strict one: no keyword outside the subset.
    expect(JSON.stringify(body.response_format.json_schema.schema)).not.toContain('maxLength');
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
    const send: ChatTransport = (_url, init) => {
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
});
