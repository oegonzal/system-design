import { stubApi } from '@sysdesign/web-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  makePipeline,
  makePromptDocument,
  makeRun,
  PROMPT_ENTRIES,
  RUN_SUMMARIES,
} from '../testing/fixtures';
import { api } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quality-loop api client', () => {
  it('[QLU-1] reads the library and the pipelines, unwrapping the envelope', async () => {
    const pipeline = makePipeline();
    const { calls } = stubApi([
      { path: '/prompts', body: { data: PROMPT_ENTRIES } },
      { path: '/pipelines', body: { data: [pipeline] } },
      { path: '/prompts/order-history', body: { data: makePromptDocument() } },
    ]);

    expect(await api.listPrompts()).toEqual(PROMPT_ENTRIES);
    expect(await api.listPipelines()).toEqual([pipeline]);
    expect((await api.getPrompt('order-history')).markdown).toContain('# Prompt');
    expect(calls.map((call) => call.url)).toEqual([
      '/prompts',
      '/pipelines',
      '/prompts/order-history',
    ]);
  });

  it('[QLU-1] starts a run with a JSON body and polls it by id', async () => {
    const run = makeRun();
    const { fetchMock } = stubApi([
      {
        method: 'POST',
        path: '/runs',
        status: 202,
        body: { data: { runId: run.runId, status: 'running' } },
      },
      { path: `/runs/${run.runId}`, body: { data: run } },
    ]);

    const started = await api.startRun({
      pipeline: 'system-design',
      goal: '# Goal',
      maxIterations: 1,
    });
    expect(started).toEqual({ runId: run.runId, status: 'running' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      pipeline: 'system-design',
      goal: '# Goal',
      maxIterations: 1,
    });

    expect((await api.getRun(run.runId)).trace?.finalDecision).toBe('revise');
  });

  it('[QLU-4] lists runs with the query string and keeps the page meta', async () => {
    const meta = { total: 3, limit: 20, offset: 0 };
    const { calls } = stubApi([{ path: '/runs', body: { data: RUN_SUMMARIES, meta } }]);

    const page = await api.listRuns({ limit: 20, status: 'complete' });

    expect(page.data).toEqual(RUN_SUMMARIES);
    expect(page.meta).toEqual(meta);
    expect(calls[0]?.url).toBe('/runs?limit=20&status=complete');
  });
});
