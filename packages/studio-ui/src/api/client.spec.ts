import { stubApi } from '@sysdesign/web-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { ApiError } from '@sysdesign/web-kit';

import { makePrompt } from '../testing/fixtures';
import { api } from './client';

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

  it('encodes a library id segment by segment, keeping the slashes the proxy route matches', async () => {
    const { calls } = stubApi([
      {
        path: '/api/prompts/library/interviews/order%20history',
        body: { data: { id: 'interviews/order history', title: 'x', markdown: '# x' } },
      },
    ]);

    await api.getPromptLibraryDocument('interviews/order history');

    expect(calls[0].url).toBe('/api/prompts/library/interviews/order%20history');
  });

  it('posts a submission with both brief and narrative keys, null when nothing was claimed', async () => {
    const { fetchMock } = stubApi([
      {
        method: 'POST',
        path: '/api/sessions/session-1/revisions',
        status: 201,
        body: { data: {} },
      },
    ]);

    await api.submitRevision('session-1', {
      graph: { nodes: [], edges: [] },
      brief: null,
      narrative: null,
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      graph: { nodes: [], edges: [] },
      brief: null,
      narrative: null,
    });
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
});
