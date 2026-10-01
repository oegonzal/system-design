import { stubApi } from '@sysdesign/web-testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSession } from '../../testing/fixtures';
import { IN_FLIGHT_POLL_INTERVAL_MS, useSessionInFlight } from './use-session-in-flight';

const SESSION_PATH = /^\/api\/sessions\/session-1$/;
const GRADE = { kind: 'grade', runId: 'run-2', revisionNumber: 2, state: 'running' } as const;

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

describe('useSessionInFlight', () => {
  it('[DEL-3] holds the slot from the moment a run starts, re-reads the session while it is held, and frees it when the server does', async () => {
    const { calls } = stubApi([
      {
        path: SESSION_PATH,
        sequence: [
          { data: makeSession({ inFlight: GRADE }) },
          { data: makeSession({ inFlight: null }) },
        ],
      },
    ]);
    const hook = renderHook(() => useSessionInFlight('session-1'));
    expect(hook.result.current.inFlight).toBeNull();
    await advance(IN_FLIGHT_POLL_INTERVAL_MS);
    expect(calls).toHaveLength(0);

    act(() => hook.result.current.hold(GRADE));
    expect(hook.result.current.inFlight).toEqual(GRADE);

    await advance(0);
    expect(hook.result.current.inFlight).toEqual(GRADE);
    await advance(IN_FLIGHT_POLL_INTERVAL_MS);
    expect(hook.result.current.inFlight).toBeNull();

    const settled = calls.length;
    await advance(IN_FLIGHT_POLL_INTERVAL_MS * 3);
    expect(calls).toHaveLength(settled);
  });

  it('[DEL-3] asks the server at once when a watched run ends, rather than waiting out the tick', async () => {
    stubApi([
      {
        path: SESSION_PATH,
        sequence: [
          { data: makeSession({ inFlight: GRADE }) },
          { data: makeSession({ inFlight: null }) },
        ],
      },
    ]);
    const hook = renderHook(() => useSessionInFlight('session-1'));
    act(() => hook.result.current.hold(GRADE));
    await advance(0);
    expect(hook.result.current.inFlight).toEqual(GRADE);

    act(() => hook.result.current.recheck());
    await advance(0);
    expect(hook.result.current.inFlight).toBeNull();
  });

  it('[DEL-3] reports a different run the server says holds the slot', async () => {
    const coach = { kind: 'coach', runId: 'run-3', revisionNumber: 2, state: 'running' } as const;
    stubApi([{ path: SESSION_PATH, body: { data: makeSession({ inFlight: coach }) } }]);
    const hook = renderHook(() => useSessionInFlight('session-1'));

    act(() => hook.result.current.hold(GRADE));
    await advance(0);
    expect(hook.result.current.inFlight).toEqual(coach);
  });
});
