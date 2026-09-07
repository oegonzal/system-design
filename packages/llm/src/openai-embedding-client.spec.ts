import { describe, expect, it, vi } from 'vitest';

import { MAX_INPUTS_PER_REQUEST, OpenAiEmbeddingClient } from './openai-embedding-client';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

const vector = (seed: number, width = 4): number[] =>
  Array.from({ length: width }, (_, index) => seed + index / 10);

/** A transport that answers the scripted replies in order and records every request. */
function transport(replies: readonly Reply[]) {
  const requests: { body: { model: string; input: string[]; dimensions: number } }[] = [];
  let call = 0;
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    requests.push({ body: JSON.parse(String(init.body)) });
    const reply = replies[Math.min(call++, replies.length - 1)];
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    });
  });
  return { fetch, requests };
}

const embeddingsOf = (inputs: readonly string[], width = 4) => ({
  data: inputs.map((_, index) => ({ index, embedding: vector(index, width) })),
});

describe('OpenAiEmbeddingClient', () => {
  it('[QL-18] returns vectors in input order whatever order the provider answers in, always asking for its width', async () => {
    const shuffled = { data: [1, 0].map((index) => ({ index, embedding: vector(index) })) };
    const { fetch, requests } = transport([{ status: 200, body: shuffled }]);
    const client = new OpenAiEmbeddingClient({ apiKey: 'k', dimensions: 4, fetch });

    await expect(client.embed(['a', 'b'])).resolves.toEqual([vector(0), vector(1)]);
    expect(requests[0].body).toEqual({
      model: 'text-embedding-3-small',
      input: ['a', 'b'],
      dimensions: 4,
    });
    expect(client.model).toBe('text-embedding-3-small');
  });

  it('[QL-18] batches at the provider ceiling and concatenates in order', async () => {
    const inputs = Array.from({ length: 250 }, (_, index) => `t${index}`);
    const sleep = vi.fn(async () => undefined);
    const { fetch, requests } = transport([
      { status: 200, body: embeddingsOf(inputs.slice(0, 100)) },
    ]);
    const client = new OpenAiEmbeddingClient({ apiKey: 'k', dimensions: 4, fetch, sleep });
    // Every reply carries 100 vectors; the last batch has 50 inputs and must be rejected.
    await expect(client.embed(inputs)).resolves.toBeNull();
    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.body.input.length)).toEqual([100, 100, 50]);
    expect(MAX_INPUTS_PER_REQUEST).toBe(100);
  });

  it('[QL-18] retries a rate limit once, honouring retry-after, and gives up after a second failure', async () => {
    const sleep = vi.fn(async () => undefined);
    const rateLimited = { status: 429, headers: { 'retry-after': '2' } };
    const okThen = transport([rateLimited, { status: 200, body: embeddingsOf(['a']) }]);
    const client = new OpenAiEmbeddingClient({
      apiKey: 'k',
      dimensions: 4,
      fetch: okThen.fetch,
      sleep,
    });
    await expect(client.embed(['a'])).resolves.toEqual([vector(0)]);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(okThen.requests).toHaveLength(2);

    const twice = transport([{ status: 500 }, { status: 503 }]);
    const failing = new OpenAiEmbeddingClient({
      apiKey: 'k',
      dimensions: 4,
      fetch: twice.fetch,
      sleep,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(failing.embed(['a'])).resolves.toBeNull();
    expect(twice.requests).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status 503'));
    warn.mockRestore();
  });

  it('[QL-18] a client error is not retried, a thrown transport is null, and a wrong width is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unauthorised = transport([{ status: 401 }]);
    await expect(
      new OpenAiEmbeddingClient({ apiKey: 'k', dimensions: 4, fetch: unauthorised.fetch }).embed([
        'a',
      ]),
    ).resolves.toBeNull();
    expect(unauthorised.requests).toHaveLength(1);

    const thrown = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    await expect(
      new OpenAiEmbeddingClient({ apiKey: 'k', dimensions: 4, fetch: thrown }).embed(['a']),
    ).resolves.toBeNull();

    const narrow = transport([{ status: 200, body: embeddingsOf(['a'], 3) }]);
    await expect(
      new OpenAiEmbeddingClient({ apiKey: 'k', dimensions: 4, fetch: narrow.fetch }).embed(['a']),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('4 numbers wide'));
    warn.mockRestore();
  });

  it('[QL-18] embeds nothing without a request', async () => {
    const { fetch, requests } = transport([{ status: 200, body: { data: [] } }]);
    await expect(new OpenAiEmbeddingClient({ apiKey: 'k', fetch }).embed([])).resolves.toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
