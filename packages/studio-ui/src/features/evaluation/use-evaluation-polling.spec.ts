import { stubApi } from '@sysdesign/web-testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeEvaluation } from '../../testing/fixtures';
import {
  POLL_BACKOFF_MAX_MS,
  POLL_INTERVAL_MS,
  UNREACHABLE_AFTER,
  useEvaluationPolling,
} from './use-evaluation-polling';

const EVAL_PATH = /^\/api\/revisions\/rev-1\/evaluation$/;

function envelope(status: 'running' | 'complete' | 'failed', error?: string) {
  return {
    data: makeEvaluation({
      status,
      ...(status === 'complete'
        ? {}
        : { overall: null, decision: null, dimensions: {}, findings: [], criterionResults: [] }),
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
  it('polls running → complete, then stops', async () => {
    const { fetchMock } = stubApi([
      { path: EVAL_PATH, sequence: [envelope('running'), envelope('complete')] },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));

    await advance(0);
    expect(hook.result.current.evaluation?.status).toBe('running');
    expect(hook.result.current.isPolling).toBe(true);
    expect(hook.result.current.message).toBe('Evaluation running…');

    await advance(POLL_INTERVAL_MS);
    expect(hook.result.current.evaluation?.status).toBe('complete');
    expect(hook.result.current.isPolling).toBe(false);
    expect(hook.result.current.message).toBe('Evaluation complete — 72/100 · revise.');

    // Terminal state: no further polls, ever.
    const callsAtCompletion = fetchMock.mock.calls.length;
    await advance(POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtCompletion);
  });

  it('stops on failed and surfaces the run error', async () => {
    const { fetchMock } = stubApi([
      { path: EVAL_PATH, sequence: [envelope('running'), envelope('failed', 'Critic exploded')] },
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
    const { fetchMock } = stubApi([{ path: EVAL_PATH, sequence: [envelope('running')] }]);

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

  /**
   * Only the quality loop knows how long its lenses take — minutes under a
   * model. A tab that gave up on its own clock sat on a stale `running` with
   * Submit disabled while the loop was still grading: it looked hung.
   */
  it('never gives up on a long-running grade — it is status-driven, not clock-capped', async () => {
    const { fetchMock } = stubApi([
      {
        path: EVAL_PATH,
        handler: ({ count }) => ({ body: envelope(count < 400 ? 'running' : 'complete') }),
      },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));
    await advance(0);
    await advance(10 * 60_000);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(400);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.evaluation?.status).toBe('complete');
    expect(hook.result.current.isPolling).toBe(false);
  });

  it('backs off through an unreachable API and recovers — the resubmit button is not for outages', async () => {
    const { fetchMock } = stubApi([
      {
        path: EVAL_PATH,
        handler: ({ count }) =>
          count < UNREACHABLE_AFTER
            ? { status: 503, body: { message: 'restarting' } }
            : { body: envelope('complete') },
      },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));
    await advance(0);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.isPolling).toBe(true);
    expect(hook.result.current.message).toBe('Checking evaluation status…');

    await advance(POLL_INTERVAL_MS * 2);
    await advance(POLL_INTERVAL_MS * 4);
    expect(hook.result.current.message).toBe('Cannot reach the API — retrying…');
    expect(hook.result.current.error).toBeNull();

    await advance(POLL_BACKOFF_MAX_MS);
    expect(hook.result.current.evaluation?.status).toBe('complete');
    expect(hook.result.current.isPolling).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(UNREACHABLE_AFTER + 1);
  });

  it('a 404 is a fact about the grade, not the connection — terminal', async () => {
    const { fetchMock } = stubApi([
      { path: EVAL_PATH, status: 404, body: { message: 'no such evaluation' } },
    ]);

    const hook = renderHook(() => useEvaluationPolling('rev-1'));
    await advance(0);

    expect(hook.result.current.error).toContain('no such evaluation');
    expect(hook.result.current.isPolling).toBe(false);
    await advance(POLL_BACKOFF_MAX_MS * 2);
    expect(fetchMock.mock.calls.length).toBe(1);
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
