import { stubApi } from '@sysdesign/web-testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeImproveIteration, makeImproveRun } from '../../testing/fixtures';
import {
  IMPROVE_POLL_BACKOFF_MAX_MS,
  IMPROVE_POLL_INTERVAL_MS,
  IMPROVE_UNREACHABLE_AFTER,
  useImproveRunPolling,
} from './use-improve-run-polling';

const RUN_PATH = /^\/api\/sessions\/session-1\/improve\/run-2$/;

const running = (imported: number, exchangeCount: number) => ({
  data: makeImproveRun({
    exchangeCount,
    iterations: [
      makeImproveIteration(),
      ...Array.from({ length: imported }, (_, index) =>
        makeImproveIteration({
          iteration: index + 2,
          overall: 70 + index * 5,
          revisionId: `rev-${index + 2}`,
        }),
      ),
    ],
  }),
});

const completed = () => ({
  data: makeImproveRun({
    ...running(2, 12).data,
    status: 'complete',
    stopReason: 'max-iterations',
  }),
});

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

describe('useImproveRunPolling', () => {
  it('[UX-11] polls the run as iterations are imported, reports acceptedCount, and stops at terminal', async () => {
    const { fetchMock } = stubApi([
      { path: RUN_PATH, sequence: [running(0, 3), running(1, 8), completed()] },
    ]);

    const hook = renderHook(() => useImproveRunPolling('session-1', 'run-2'));

    await advance(0);
    expect(hook.result.current.run?.status).toBe('running');
    expect(hook.result.current.acceptedCount).toBe(0); // the starting point is not an import
    expect(hook.result.current.message).toBe('Coaching — 3 model calls so far.');

    await advance(IMPROVE_POLL_INTERVAL_MS);
    expect(hook.result.current.acceptedCount).toBe(1);
    expect(hook.result.current.message).toBe('Coaching — 8 model calls so far.');

    await advance(IMPROVE_POLL_INTERVAL_MS);
    expect(hook.result.current.run?.status).toBe('complete');
    expect(hook.result.current.isPolling).toBe(false);
    expect(hook.result.current.message).toBe('Coach finished — best score 75.');

    const callsAtCompletion = fetchMock.mock.calls.length;
    await advance(IMPROVE_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtCompletion);
  });

  it('surfaces a failed run through error and stops', async () => {
    const { fetchMock } = stubApi([
      {
        path: RUN_PATH,
        sequence: [
          { data: makeImproveRun({ status: 'failed', error: 'the producer has no model' }) },
        ],
      },
    ]);

    const hook = renderHook(() => useImproveRunPolling('session-1', 'run-2'));
    await advance(0);

    expect(hook.result.current.error).toContain('no model');
    expect(hook.result.current.isPolling).toBe(false);

    const callsAtFailure = fetchMock.mock.calls.length;
    await advance(IMPROVE_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtFailure);
  });

  it('never gives up on a long run — status-driven, not clock-capped', async () => {
    const { fetchMock } = stubApi([
      {
        path: RUN_PATH,
        handler: ({ count }) => ({ body: count < 500 ? running(1, count) : completed() }),
      },
    ]);

    const hook = renderHook(() => useImproveRunPolling('session-1', 'run-2'));
    await advance(0);
    await advance(15 * 60_000);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(500);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.run?.status).toBe('complete');
  });

  it('backs off through an unreachable API and recovers instead of failing the run', async () => {
    const { fetchMock } = stubApi([
      {
        path: RUN_PATH,
        handler: ({ count }) =>
          count < IMPROVE_UNREACHABLE_AFTER
            ? { status: 503, body: { message: 'restarting' } }
            : { body: completed() },
      },
    ]);

    const hook = renderHook(() => useImproveRunPolling('session-1', 'run-2'));
    await advance(0);
    expect(hook.result.current.error).toBeNull();

    await advance(IMPROVE_POLL_INTERVAL_MS * 2);
    await advance(IMPROVE_POLL_INTERVAL_MS * 4);
    expect(hook.result.current.message).toBe('Cannot reach the API — retrying…');

    await advance(IMPROVE_POLL_BACKOFF_MAX_MS);
    expect(hook.result.current.run?.status).toBe('complete');
    expect(fetchMock.mock.calls.length).toBe(IMPROVE_UNREACHABLE_AFTER + 1);
  });

  it('a null run id never fetches; unmount stops the chain', async () => {
    const { fetchMock } = stubApi([{ path: RUN_PATH, sequence: [running(0, 1)] }]);

    const idle = renderHook(() => useImproveRunPolling('session-1', null));
    await advance(IMPROVE_POLL_INTERVAL_MS);
    expect(fetchMock.mock.calls.length).toBe(0);
    idle.unmount();

    const live = renderHook(() => useImproveRunPolling('session-1', 'run-2'));
    await advance(0);
    const callsBeforeUnmount = fetchMock.mock.calls.length;
    live.unmount();
    await advance(IMPROVE_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
