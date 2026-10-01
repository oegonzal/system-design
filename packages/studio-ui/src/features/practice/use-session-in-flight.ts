'use client';

import type { DesignSessionDetailDto, SessionInFlightDto } from '@sysdesign/contracts';
import { usePolledResource } from '@sysdesign/web-kit';
import { useCallback, useState } from 'react';

import { api } from '../../api/client';

/** A session read asks the grader too, so the slot is re-read slower than a grade is polled. */
export const IN_FLIGHT_POLL_INTERVAL_MS = 3000;

export interface SessionInFlight {
  /** The run holding the session's grading slot, as the server last said; null when nothing does. */
  inFlight: SessionInFlightDto | null;
  /** What the page's own read of the session said, or a run this tab has just started. */
  hold(inFlight: SessionInFlightDto | null): void;
  /** Ask the server now — a run this tab watches has just ended. */
  recheck(): void;
}

const slotKey = (inFlight: SessionInFlightDto | null): string | null =>
  inFlight === null ? null : `${inFlight.kind}:${inFlight.runId}`;

/**
 * What holds the session's one grading slot — a submitted revision's grade
 * or a coaching run — with the server as the source of truth: seeded from
 * the page's read of the session and from every run this tab starts, then
 * re-read while anything holds it, until the server says nothing does — and
 * at once when a run the page watches ends, rather than at the next tick.
 * Whatever revision is on screen, Submit and the coach gate on this, so
 * viewing an older revision never re-opens a slot a run still holds.
 */
export function useSessionInFlight(sessionId: string): SessionInFlight {
  const [held, setHeld] = useState<SessionInFlightDto | null>(null);
  const { resource, restart } = usePolledResource<DesignSessionDetailDto>({
    key: slotKey(held),
    fetch: (_key, signal) => api.getSession(sessionId, { signal }),
    isTerminal: (session) => session.inFlight === null,
    intervalMs: IN_FLIGHT_POLL_INTERVAL_MS,
  });
  const hold = useCallback((next: SessionInFlightDto | null) => setHeld(next), []);
  return { inFlight: resource !== null ? resource.inFlight : held, hold, recheck: restart };
}
