import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { makePrompt } from '../testing/fixtures';
import { stubApi } from '../testing/stub-api';
import { api, ApiError, isAbortError, query, toErrorMessage } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('unwraps the { data } envelope for single resources', async () => {
    const prompt = makePrompt();
    stubApi([{ path: '/api/prompts/prompt-1', body: { data: prompt } }]);

    const result = await api.getPrompt('prompt-1');

    expect(result).toEqual(prompt);
  });

  it('returns { data, meta } for list endpoints', async () => {
    const prompt = makePrompt();
    stubApi([
      {
        path: '/api/prompts',
        body: { data: [prompt], meta: { total: 1, limit: 50, offset: 0 } },
      },
    ]);

    const result = await api.listPrompts();

    expect(result.data).toEqual([prompt]);
    expect(result.meta).toEqual({ total: 1, limit: 50, offset: 0 });
  });

  it('encodes query params, keeping zeros and dropping undefined', async () => {
    const { calls } = stubApi([
      { path: '/api/prompts', body: { data: [], meta: { total: 0, limit: 10, offset: 0 } } },
    ]);

    await api.listPrompts({ experienceId: 'exp 1', limit: 10, offset: 0 });

    expect(calls[0].url).toBe('/api/prompts?experienceId=exp+1&limit=10&offset=0');
  });

  it('query() drops only undefined values', () => {
    expect(query({ a: 0, b: undefined, c: false, d: 'x y' })).toBe('?a=0&c=false&d=x+y');
    expect(query({})).toBe('');
  });

  it('throws ApiError with status and flattened Nest message on non-ok', async () => {
    stubApi([
      {
        path: '/api/prompts/nope',
        status: 404,
        body: { statusCode: 404, message: 'Prompt not found', error: 'Not Found' },
      },
    ]);

    const thrown = await api.getPrompt('nope').catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(404);
    expect((thrown as ApiError).message).toBe('Prompt not found');
  });

  it('joins validation message arrays', async () => {
    stubApi([
      {
        method: 'POST',
        path: '/api/star-stories',
        status: 400,
        body: { statusCode: 400, message: ['title must not be empty', 'tags too long'] },
      },
    ]);

    const thrown = await api
      .createStory({
        title: '',
        situation: 's',
        task: 't',
        action: 'a',
        result: 'r',
        tags: [],
      })
      .catch((error: unknown) => error);

    expect((thrown as ApiError).message).toBe('title must not be empty; tags too long');
  });

  it('treats 204 responses as void', async () => {
    stubApi([{ method: 'DELETE', path: '/api/star-stories/story-1', status: 204 }]);

    await expect(api.deleteStory('story-1')).resolves.toBeUndefined();
  });

  it('sends JSON bodies with the content-type header', async () => {
    const { fetchMock } = stubApi([
      { method: 'POST', path: '/api/sessions', status: 201, body: { data: {} } },
    ]);

    await api.createSession({ promptId: 'prompt-1' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ promptId: 'prompt-1' }));
  });

  it('isAbortError recognizes AbortError and toErrorMessage prefers ApiError copy', () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);

    expect(toErrorMessage(new ApiError(500, { statusCode: 500, message: 'DB down' }), 'x')).toBe(
      'DB down',
    );
    expect(toErrorMessage('not-an-error', 'fallback copy')).toBe('fallback copy');
    expect(toErrorMessage(abort, 'fallback copy')).toBe('fallback copy');
  });
});
