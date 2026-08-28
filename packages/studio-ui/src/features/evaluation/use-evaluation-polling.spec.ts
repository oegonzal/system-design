import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeEvaluation } from '../../testing/fixtures';
import { stubApi } from '../../testing/stub-api';
import { POLL_INTERVAL_MS, useEvaluationPolling } from './use-evaluation-polling';

const EVAL_PATH = /^\/api\/revisions\/rev-1\/evaluation$/;

function envelope(status: 'queued' | 'running' | 'complete' | 'failed', error?: string) {
  return {
    data: makeEvaluation({
      status,
      ...(status === 'complete'
        ? {}
        : { overallScore: null, grade: null, dimensionScores: null, findings: [] }),
      ...(error !== undefined ? { error } : {}),
    }),
  };
}

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

describe('useEvaluationPolling', () => {
  it('polls queued → running → complete, then stops', async () => {
    const { fetchMock } = stubApi([
      {
        path: EVAL_PATH,
        sequence: [envelope('queued'), envelope('running'), envelope('complete')],
      },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));

    await advance(0);
    expect(hook.result.current.evaluation?.status).toBe('queued');
    expect(hook.result.current.isPolling).toBe(true);
    expect(hook.result.current.message).toBe('Evaluation queued.');

    await advance(POLL_INTERVAL_MS);
    expect(hook.result.current.evaluation?.status).toBe('running');

    await advance(POLL_INTERVAL_MS);
    expect(hook.result.current.evaluation?.status).toBe('complete');
    expect(hook.result.current.isPolling).toBe(false);
    expect(hook.result.current.message).toBe('Evaluation complete — grade B.');

    // Terminal state: no further polls, ever.
    const callsAtCompletion = fetchMock.mock.calls.length;
    await advance(POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtCompletion);
  });

  it('stops on failed and surfaces the evaluation error', async () => {
    const { fetchMock } = stubApi([
      {
        path: EVAL_PATH,
        sequence: [envelope('queued'), envelope('failed', 'Critic exploded')],
      },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));

    await advance(0);
    await advance(POLL_INTERVAL_MS);

    expect(hook.result.current.evaluation?.status).toBe('failed');
    expect(hook.result.current.error).toBe('Critic exploded');
    expect(hook.result.current.isPolling).toBe(false);

    const callsAtFailure = fetchMock.mock.calls.length;
    await advance(POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtFailure);
  });

  it('unmount stops the timer chain', async () => {
    const { fetchMock } = stubApi([{ path: EVAL_PATH, sequence: [envelope('queued')] }]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));
    await advance(0);
    const callsBeforeUnmount = fetchMock.mock.calls.length;

    hook.unmount();
    await advance(POLL_INTERVAL_MS * 5);

    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('a null revision id never fetches', async () => {
    const { fetchMock } = stubApi([]);

    const hook = renderHook(() => useEvaluationPolling(null));
    await advance(POLL_INTERVAL_MS * 2);

    expect(fetchMock.mock.calls.length).toBe(0);
    expect(hook.result.current.isPolling).toBe(false);
    expect(hook.result.current.evaluation).toBeNull();
  });

  it('restart begins a fresh poll cycle', async () => {
    const { fetchMock } = stubApi([
      { path: EVAL_PATH, sequence: [envelope('failed', 'Boom'), envelope('complete')] },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));
    await advance(0);
    expect(hook.result.current.error).toBe('Boom');

    act(() => hook.result.current.restart());
    await advance(0);

    expect(fetchMock.mock.calls.length).toBe(2);
    expect(hook.result.current.evaluation?.status).toBe('complete');
    expect(hook.result.current.error).toBeNull();
  });
});
