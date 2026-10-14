'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useImproveRunPolling } from '../improve/use-improve-run-polling';

/**
 * The coach run the page follows: polled until it ends, each iteration it
 * imports read into the timeline as the poll reports it — not minutes later
 * at run end — and the timeline and the session's slot read again once it
 * ends, which is when it writes what became of its base revision. `follow`
 * moves to another run: the session's newest on open, or one just started,
 * counting its imports from none.
 */
export function useCoachRun(sessionId: string, refresh: () => void, recheckSlot: () => void) {
  const [runId, setRunId] = useState<string | null>(null);
  const improve = useImproveRunPolling(sessionId, runId);

  const acceptedSeen = useRef(0);
  useEffect(() => {
    if (improve.acceptedCount <= acceptedSeen.current) return;
    acceptedSeen.current = improve.acceptedCount;
    refresh();
  }, [improve.acceptedCount, refresh]);

  const endedFor = useRef<string | null>(null);
  useEffect(() => {
    const run = improve.run;
    if (!run || run.status === 'running' || endedFor.current === run.runId) return;
    endedFor.current = run.runId;
    refresh();
    recheckSlot();
  }, [improve.run, refresh, recheckSlot]);

  const follow = useCallback((next: string | null) => {
    acceptedSeen.current = 0;
    setRunId(next);
  }, []);

  return { improve, follow };
}
