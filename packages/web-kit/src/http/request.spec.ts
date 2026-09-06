import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createRequest, isAbortError, query, toErrorMessage, unwrap } from './request';

type Reply = { status?: number; body?: unknown };

function stubFetch(reply: Reply | ((url: string, init?: RequestInit) => Reply)) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { status = 200, body } = typeof reply === 'function' ? reply(String(input), init) : reply;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body ?? null), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRequest', () => {
  const request = createRequest('http://api.test/v1');

  it('[WEB-1] prefixes the base URL, forwards the signal and parses JSON', async () => {
    const fetchMock = stubFetch({ body: { data: { id: 'x' } } });
    const controller = new AbortController();

    const reply = await request<{ data: { id: string } }>('/things/x', {
      signal: controller.signal,
    });

    expect(unwrap(reply)).toEqual({ id: 'x' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/v1/things/x');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBe(controller.signal);
  });

  it('sends JSON bodies with the content-type header, and nothing for a GET', async () => {
    const fetchMock = stubFetch({ status: 201, body: { data: {} } });

    await request('/things', { method: 'POST', body: { name: 'n' } });
    await request('/things');

    const post = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(post.method).toBe('POST');
    expect(post.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(post.body).toBe(JSON.stringify({ name: 'n' }));
    const get = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(get.method).toBe('GET');
    expect(get.headers).toBeUndefined();
  });

  it('throws ApiError with the status and a flattened Nest message on non-ok', async () => {
    stubFetch({ status: 404, body: { statusCode: 404, message: 'Thing not found' } });

    const thrown = await request('/things/nope').catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(404);
    expect((thrown as ApiError).message).toBe('Thing not found');
  });

  it('joins validation message arrays and falls back to the status when the body is opaque', async () => {
    stubFetch({ status: 400, body: { message: ['title must not be empty', 'tags too long'] } });
    const validation = await request('/things').catch((error: unknown) => error);
    expect((validation as ApiError).message).toBe('title must not be empty; tags too long');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 502 })),
    );
    const opaque = await request('/things').catch((error: unknown) => error);
    expect((opaque as ApiError).message).toBe('Request failed with status 502');
    expect((opaque as ApiError).body).toBeUndefined();
  });

  it('treats 204 responses as void', async () => {
    stubFetch({ status: 204 });
    await expect(request('/things/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('helpers', () => {
  it('query() drops only undefined values', () => {
    expect(query({ a: 0, b: undefined, c: false, d: 'x y' })).toBe('?a=0&c=false&d=x+y');
    expect(query({})).toBe('');
  });

  it('isAbortError recognizes AbortError and toErrorMessage prefers ApiError copy', () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);

    expect(toErrorMessage(new ApiError(500, { statusCode: 500, message: 'DB down' }), 'x')).toBe(
      'DB down',
    );
    expect(toErrorMessage(new Error('plain'), 'fallback copy')).toBe('plain');
    expect(toErrorMessage('not-an-error', 'fallback copy')).toBe('fallback copy');
    expect(toErrorMessage(abort, 'fallback copy')).toBe('fallback copy');
  });
});
