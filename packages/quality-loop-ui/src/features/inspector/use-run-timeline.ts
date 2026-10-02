'use client';

import type { QualityRunDto } from '@sysdesign/contracts';
import { usePolledResource } from '@sysdesign/web-kit';
import { useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';
import { deriveRun } from './model/derive-run';
import { emptyTimeline, recordActions, type Timeline } from './model/timeline';

/**
 * One run, followed, with every snapshot folded into the append-only log.
 *
 * The polling itself is the app's existing status-driven hook — a run takes
 * minutes on the subscription client, so the record is read until it is complete
 * or failed. What this adds is the fold: the first snapshot is *reconstructed*
 * (a faithful account of what happened, with only the timestamps the wire
 * carries), and everything a later poll reveals is *recorded* with the moment it
 * was seen. The clock lives here, so the model stays pure.
 */

const fetchRun = (runId: string, signal: AbortSignal) => api.getRun(runId, { signal });
const isTerminal = (run: QualityRunDto) => run.status !== 'running';
const terminalError = (run: QualityRunDto) =>
  run.status === 'failed' ? (run.error?.message ?? 'The run failed.') : null;

export interface RunTimeline {
  timeline: Timeline;
  /** The run as last read — for the panels that join against it. */
  run: QualityRunDto | null;
  /** A TERMINAL problem: the run failed, or there is no such run. Never a transient outage. */
  error: string | null;
  isPolling: boolean;
  unreachable: boolean;
}

export function useRunTimeline(runId: string | null): RunTimeline {
  const {
    resource: run,
    error,
    isPolling,
    unreachable,
  } = usePolledResource<QualityRunDto>({ key: runId, fetch: fetchRun, isTerminal, terminalError });
  const [timeline, setTimeline] = useState<Timeline>(emptyTimeline);
  // Which run the log holds, so changing runs starts a new one rather than
  // appending a second run's actions to the first's.
  const held = useRef<string | null>(null);

  useEffect(() => {
    if (run === null) return;
    const first = held.current !== run.runId;
    held.current = run.runId;
    const observedAt = new Date().toISOString();
    /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       folding an arriving snapshot into the log is precisely this effect's contract */
    setTimeline((current) =>
      recordActions(first ? emptyTimeline() : current, deriveRun(run), {
        provenance: first ? 'reconstructed' : 'recorded',
        observedAt,
      }),
    );
  }, [run]);

  useEffect(() => {
    if (runId === null) {
      held.current = null;
      /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
         a log with no run to hold is empty, which only an effect can notice */
      setTimeline(emptyTimeline());
    }
  }, [runId]);

  return { timeline, run, error, isPolling, unreachable };
}
