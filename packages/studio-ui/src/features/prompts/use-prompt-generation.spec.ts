import { stubApi } from '@sysdesign/web-testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makePrompt, makePromptGeneration } from '../../testing/fixtures';
import { GENERATION_POLL_INTERVAL_MS, usePromptGeneration } from './use-prompt-generation';

const START = {
  method: 'POST',
  path: '/api/prompts/generate',
  status: 202,
  body: { data: { runId: 'gen-run-1', status: 'running' } },
};
const RUN_PATH = /^\/api\/prompts\/generate\/gen-run-1$/;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePromptGeneration', () => {
  it('[GEN-1] starts a run, follows it, and hands over the claimed prompt exactly once', async () => {
    const prompt = makePrompt({ source: 'generated' });
    const { calls, fetchMock } = stubApi([
      START,
      {
        path: RUN_PATH,
        sequence: [
          { data: makePromptGeneration() },
          {
            data: makePromptGeneration({
              status: 'complete',
              decision: 'accept',
              overall: 82,
              prompt,
            }),
          },
        ],
      },
    ]);
    const onComplete = vi.fn();

    const hook = renderHook(() => usePromptGeneration(onComplete));
    await act(async () => hook.result.current.start({ experienceId: 'exp-1' }));

    expect(calls[0]).toEqual({ method: 'POST', url: '/api/prompts/generate' });
    expect(hook.result.current.runId).toBe('gen-run-1');
    await advance(0);
    expect(hook.result.current.generating).toBe(true);
    expect(hook.result.current.message).toBe('Writing a prompt from your experience…');

    await advance(GENERATION_POLL_INTERVAL_MS);
    expect(hook.result.current.generating).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(prompt);

    const callsAtCompletion = fetchMock.mock.calls.length;
    await advance(GENERATION_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtCompletion);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed run through error and never navigates', async () => {
    stubApi([
      START,
      {
        path: RUN_PATH,
        sequence: [
          { data: makePromptGeneration({ status: 'failed', error: 'the writer refused' }) },
        ],
      },
    ]);
    const onComplete = vi.fn();

    const hook = renderHook(() => usePromptGeneration(onComplete));
    await act(async () => hook.result.current.start({}));
    await advance(0);

    expect(hook.result.current.error).toBe('the writer refused');
    expect(hook.result.current.generating).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('a start that fails reports the error and follows nothing', async () => {
    const { fetchMock } = stubApi([
      { ...START, status: 503, body: { statusCode: 503, message: 'no writer available' } },
    ]);

    const hook = renderHook(() => usePromptGeneration(vi.fn()));
    await act(async () => hook.result.current.start({}));

    expect(hook.result.current.error).toBe('no writer available');
    expect(hook.result.current.runId).toBeNull();
    await advance(GENERATION_POLL_INTERVAL_MS * 2);
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});
