import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../http/request';
import {
  DEFAULT_POLL_BACKOFF_MAX_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_UNREACHABLE_AFTER,
  usePolledResource,
} from './use-polled-resource';

interface Job {
  status: 'running' | 'done' | 'failed';
  error?: string;
}

const INTERVAL = DEFAULT_POLL_INTERVAL_MS;

/** A scripted fetch: one reply per call, the last repeating; a `throws` entry rejects. */
function scripted(replies: (Job | { throws: unknown })[]) {
  const seen: { key: string; signal: AbortSignal }[] = [];
  const fetch = vi.fn(async (key: string, signal: AbortSignal): Promise<Job> => {
    seen.push({ key, signal });
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    if (reply === undefined) throw new Error('no reply scripted');
    if ('throws' in reply) throw reply.throws;
    return reply;
  });
  return { fetch, seen };
}

const isTerminal = (job: Job) => job.status !== 'running';
const terminalError = (job: Job) => (job.status === 'failed' ? (job.error ?? 'Job failed.') : null);

function poll(key: string | null, fetch: (key: string, signal: AbortSignal) => Promise<Job>) {
  return renderHook(
    ({ current }: { current: string | null }) =>
      usePolledResource<Job>({
        key: current,
        fetch,
        isTerminal,
        terminalError,
      }),
    { initialProps: { current: key } },
  );
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
  vi.restoreAllMocks();
});

describe('usePolledResource', () => {
  it('[WEB-1] polls until the resource says it is terminal, then never again', async () => {
    const { fetch } = scripted([{ status: 'running' }, { status: 'running' }, { status: 'done' }]);
    const hook = poll('job-1', fetch);

    await advance(0);
    expect(hook.result.current.resource?.status).toBe('running');
    expect(hook.result.current.isPolling).toBe(true);

    await advance(INTERVAL);
    await advance(INTERVAL);
    expect(hook.result.current.resource?.status).toBe('done');
    expect(hook.result.current.isPolling).toBe(false);
    expect(hook.result.current.error).toBeNull();

    const calls = fetch.mock.calls.length;
    await advance(INTERVAL * 5);
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('a failed terminal resource surfaces its own copy as the error', async () => {
    const { fetch } = scripted([{ status: 'running' }, { status: 'failed', error: 'Boom' }]);
    const hook = poll('job-1', fetch);

    await advance(0);
    await advance(INTERVAL);

    expect(hook.result.current.error).toBe('Boom');
    expect(hook.result.current.isPolling).toBe(false);
  });

  it('a null key never fetches; unmount stops the chain', async () => {
    const idle = scripted([{ status: 'running' }]);
    const idleHook = poll(null, idle.fetch);
    await advance(INTERVAL * 2);
    expect(idle.fetch).not.toHaveBeenCalled();
    expect(idleHook.result.current.isPolling).toBe(false);

    const live = scripted([{ status: 'running' }]);
    const liveHook = poll('job-1', live.fetch);
    await advance(0);
    liveHook.unmount();
    await advance(INTERVAL * 5);
    expect(live.fetch).toHaveBeenCalledTimes(1);
  });

  it('[WEB-1] is status-driven, not clock-capped: ten minutes of running is still polling', async () => {
    let count = 0;
    const fetch = vi.fn(async (): Promise<Job> => ({
      status: count++ < 400 ? 'running' : 'done',
    }));
    const hook = poll('job-1', fetch);

    await advance(0);
    await advance(10 * 60_000);

    expect(fetch.mock.calls.length).toBeGreaterThan(400);
    expect(hook.result.current.resource?.status).toBe('done');
    expect(hook.result.current.error).toBeNull();
  });

  it('[WEB-1] backs off through an unreachable API, says so after the threshold, and recovers', async () => {
    const outage = { throws: new ApiError(503, { message: 'restarting' }) };
    const { fetch } = scripted([outage, outage, outage, { status: 'done' }]);
    const hook = poll('job-1', fetch);

    await advance(0);
    expect(hook.result.current.unreachable).toBe(false);
    expect(hook.result.current.error).toBeNull();

    await advance(INTERVAL * 2);
    await advance(INTERVAL * 4);
    expect(hook.result.current.unreachable).toBe(true);
    expect(hook.result.current.isPolling).toBe(true);

    await advance(DEFAULT_POLL_BACKOFF_MAX_MS);
    expect(hook.result.current.resource?.status).toBe('done');
    expect(hook.result.current.unreachable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(DEFAULT_UNREACHABLE_AFTER + 1);
  });

  it('[WEB-1] a 404 is a fact about the resource: terminal, with the body copy or the status', async () => {
    const withCopy = scripted([{ throws: new ApiError(404, { message: 'no such job' }) }]);
    const hook = poll('job-1', withCopy.fetch);
    await advance(0);
    expect(hook.result.current.error).toBe('no such job');
    expect(hook.result.current.isPolling).toBe(false);
    await advance(DEFAULT_POLL_BACKOFF_MAX_MS * 2);
    expect(withCopy.fetch).toHaveBeenCalledTimes(1);

    const bare = scripted([{ throws: new ApiError(404, undefined) }]);
    const bareHook = poll('job-2', bare.fetch);
    await advance(0);
    expect(bareHook.result.current.error).toBe('Request failed with status 404');
  });

  it('restart begins a fresh cycle and a key change aborts the in-flight request', async () => {
    const { fetch, seen } = scripted([{ status: 'failed', error: 'Boom' }, { status: 'done' }]);
    const hook = poll('job-1', fetch);
    await advance(0);
    expect(hook.result.current.error).toBe('Boom');

    act(() => hook.result.current.restart());
    await advance(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(hook.result.current.resource?.status).toBe('done');
    expect(hook.result.current.error).toBeNull();

    hook.rerender({ current: 'job-2' });
    expect(seen[1]?.signal.aborted).toBe(true);
    expect(hook.result.current.resource).toBeNull();
    await advance(0);
    expect(seen[2]?.key).toBe('job-2');
  });

  it('a tab coming back into view ticks at once instead of waiting out its timer', async () => {
    const { fetch } = scripted([{ status: 'running' }]);
    poll('job-1', fetch);
    await advance(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
