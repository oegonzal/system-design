import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeImprovementRun } from '../../testing/fixtures';
import { stubApi } from '../../testing/stub-api';
import {
  IMPROVE_POLL_BACKOFF_MAX_MS,
  IMPROVE_POLL_INTERVAL_MS,
  IMPROVE_UNREACHABLE_AFTER,
  useImprovementRunPolling,
} from './use-improvement-run-polling';

const RUN_PATH = /^\/api\/improvement-runs\/run-1$/;

const running = (iterations: number) => ({
  data: makeImprovementRun({
    status: 'running',
    iterations: [
      {
        iteration: 0,
        proposer: 'baseline',
        description: 'The design as submitted.',
        score: 41,
        accepted: true,
        revisionId: 'rev-1',
      },
      ...Array.from({ length: iterations }, (_, index) => ({
        iteration: index + 1,
        proposer: 'llm' as const,
        description: `Improvement ${index + 1}.`,
        score: 50 + index * 10,
        accepted: true,
        revisionId: `rev-${index + 2}`,
      })),
    ],
  }),
});

const completed = () => ({
  data: makeImprovementRun({
    ...running(2).data,
    id: 'run-1',
    status: 'completed',
    stoppedReason: 'max-iterations',
    bestRevisionId: 'rev-3',
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

describe('useImprovementRunPolling', () => {
  it('polls the trajectory as it grows, reports acceptedCount, and stops at terminal', async () => {
    const { fetchMock } = stubApi([
      { path: RUN_PATH, sequence: [running(0), running(1), completed()] },
    ]);

    const hook = renderHook(() => useImprovementRunPolling('run-1'));

    await advance(0);
    expect(hook.result.current.run?.status).toBe('running');
    expect(hook.result.current.acceptedCount).toBe(1); // the baseline
    expect(hook.result.current.message).toContain('iteration 0 of 6');

    await advance(IMPROVE_POLL_INTERVAL_MS);
    expect(hook.result.current.acceptedCount).toBe(2);
    expect(hook.result.current.message).toContain('score 50');

    await advance(IMPROVE_POLL_INTERVAL_MS);
    expect(hook.result.current.run?.status).toBe('completed');
    expect(hook.result.current.isPolling).toBe(false);

    // Terminal state: no further polls, ever.
    const callsAtCompletion = fetchMock.mock.calls.length;
    await advance(IMPROVE_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtCompletion);
  });

  it('surfaces a failed run through error and stops', async () => {
    const { fetchMock } = stubApi([
      {
        path: RUN_PATH,
        sequence: [
          {
            data: makeImprovementRun({
              status: 'failed',
              error: 'the improver has no live model',
              stoppedReason: 'llm-unavailable',
            }),
          },
        ],
      },
    ]);

    const hook = renderHook(() => useImprovementRunPolling('run-1'));
    await advance(0);

    expect(hook.result.current.error).toContain('no live model');
    expect(hook.result.current.isPolling).toBe(false);

    const callsAtFailure = fetchMock.mock.calls.length;
    await advance(IMPROVE_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtFailure);
  });

  /**
   * A subscription run of several iterations outlasts any cap a tab would
   * pick; a tab that gave up on its own clock told the author the coach had
   * timed out while the run kept going. Only the run's status ends the poll.
   */
  it('never gives up on a long run — status-driven, not clock-capped', async () => {
    const { fetchMock } = stubApi([
      {
        path: RUN_PATH,
        handler: ({ count }) => ({
          body:
            count < 500
              ? running(1)
              : { data: makeImprovementRun({ status: 'completed', stoppedReason: 'plateau' }) },
        }),
      },
    ]);

    const hook = renderHook(() => useImprovementRunPolling('run-1'));
    await advance(0);
    await advance(15 * 60_000); // fifteen minutes of `running`

    expect(fetchMock.mock.calls.length).toBeGreaterThan(500);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.run?.status).toBe('completed');
    expect(hook.result.current.isPolling).toBe(false);
  });

  it('backs off through an unreachable API and recovers instead of failing the run', async () => {
    const { fetchMock } = stubApi([
      {
        path: RUN_PATH,
        handler: ({ count }) =>
          count < IMPROVE_UNREACHABLE_AFTER
            ? { status: 503, body: { message: 'restarting' } }
            : {
                body: {
                  data: makeImprovementRun({ status: 'completed', stoppedReason: 'plateau' }),
                },
              },
      },
    ]);

    const hook = renderHook(() => useImprovementRunPolling('run-1'));
    await advance(0);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.isPolling).toBe(true);

    await advance(IMPROVE_POLL_INTERVAL_MS * 2);
    await advance(IMPROVE_POLL_INTERVAL_MS * 4);
    expect(hook.result.current.message).toBe('Cannot reach the API — retrying…');

    await advance(IMPROVE_POLL_BACKOFF_MAX_MS);
    expect(hook.result.current.run?.status).toBe('completed');
    expect(hook.result.current.error).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(IMPROVE_UNREACHABLE_AFTER + 1);
  });

  it('a null run id never fetches; unmount stops the chain', async () => {
    const { fetchMock } = stubApi([{ path: RUN_PATH, sequence: [running(0)] }]);

    const idle = renderHook(() => useImprovementRunPolling(null));
    await advance(IMPROVE_POLL_INTERVAL_MS);
    expect(fetchMock.mock.calls.length).toBe(0);
    expect(idle.result.current.isPolling).toBe(false);
    idle.unmount();

    const live = renderHook(() => useImprovementRunPolling('run-1'));
    await advance(0);
    const callsBeforeUnmount = fetchMock.mock.calls.length;
    live.unmount();
    await advance(IMPROVE_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
