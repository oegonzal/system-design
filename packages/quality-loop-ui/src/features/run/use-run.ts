'use client';

import type { QualityRunDto, StartQualityRunRequest } from '@sysdesign/contracts';
import { toErrorMessage, usePolledResource } from '@sysdesign/web-kit';
import { useCallback, useState } from 'react';

import { api } from '../../api/client';

export interface RunState {
  runId: string | null;
  run: QualityRunDto | null;
  /** A TERMINAL problem — the run failed or cannot be found. Never a transient outage. */
  error: string | null;
  isPolling: boolean;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  starting: boolean;
  startError: string | null;
  start(body: StartQualityRunRequest): Promise<void>;
  /** Follow an existing run — from the recent list or a `?run=` link. */
  select(runId: string): void;
}

function describeRun(
  run: QualityRunDto | null,
  error: string | null,
  isPolling: boolean,
  unreachable: boolean,
  starting: boolean,
): string {
  if (error !== null) return `Run problem: ${error}`;
  if (unreachable) return 'Cannot reach the quality loop — retrying…';
  if (starting) return 'Starting the run…';
  if (run === null) return isPolling ? 'Checking the run…' : '';
  switch (run.status) {
    case 'running':
      return `Run in progress — ${run.exchanges.length} model exchange${run.exchanges.length === 1 ? '' : 's'} so far.`;
    case 'complete':
      return `Run complete — ${run.trace?.finalDecision ?? 'no decision'}.`;
    case 'failed':
      return 'Run failed.';
  }
}

const fetchRun = (runId: string, signal: AbortSignal) => api.getRun(runId, { signal });
const isTerminal = (run: QualityRunDto) => run.status !== 'running';
const terminalError = (run: QualityRunDto) =>
  run.status === 'failed' ? (run.error?.message ?? 'The run failed.') : null;

/**
 * Start a run, then follow it by its own status. The loop takes minutes on
 * the subscription client, so `POST /runs` answers 202 and the record is
 * polled until it is complete or failed; exchanges accrue on it meanwhile.
 */
export function useRun(): RunState {
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const {
    resource: run,
    error,
    isPolling,
    unreachable,
  } = usePolledResource<QualityRunDto>({ key: runId, fetch: fetchRun, isTerminal, terminalError });

  const start = useCallback(async (body: StartQualityRunRequest) => {
    setStarting(true);
    setStartError(null);
    try {
      const started = await api.startRun(body);
      setRunId(started.runId);
    } catch (caught) {
      setStartError(toErrorMessage(caught, 'Could not start the run.'));
    } finally {
      setStarting(false);
    }
  }, []);

  const select = useCallback((next: string) => {
    setStartError(null);
    setRunId(next);
  }, []);

  return {
    runId,
    run,
    error,
    isPolling,
    message: describeRun(run, error, isPolling, unreachable, starting),
    starting,
    startError,
    start,
    select,
  };
}
