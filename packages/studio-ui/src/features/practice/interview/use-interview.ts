'use client';

import type { InterviewStateDto } from '@sysdesign/contracts';
import { toErrorMessage, usePolledResource } from '@sysdesign/web-kit';
import { useCallback, useState } from 'react';

import { api } from '../../../api/client';

/** How often the panel asks after the interviewer while a reply is pending. */
export const INTERVIEW_POLL_INTERVAL_MS = 1500;

export interface InterviewActions {
  state: InterviewStateDto | null;
  /** A terminal problem with the read, or the last action the server refused. */
  error: string | null;
  isPolling: boolean;
  unreachable: boolean;
  /** True while an action is being posted. */
  busy: boolean;
  ask: (questions: string[]) => Promise<void>;
  probe: () => Promise<void>;
  answer: (text: string) => Promise<void>;
  advance: () => Promise<void>;
  reload: () => void;
}

/**
 * The interview as the panel drives it: the state is polled while a reply is
 * pending and read once when none is, and every action posts and then reads
 * again — the read is what claims a finished reply, so the panel never shows
 * a turn the server has not stored.
 */
export function useInterview(sessionId: string): InterviewActions {
  const polled = usePolledResource<InterviewStateDto>({
    key: sessionId,
    fetch: (key, signal) => api.getInterview(key, { signal }),
    isTerminal: (state) => state.pending === null,
    intervalMs: INTERVIEW_POLL_INTERVAL_MS,
  });
  const { restart } = polled;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await action();
        restart();
      } catch (caught) {
        setActionError(toErrorMessage(caught, fallback));
      } finally {
        setBusy(false);
      }
    },
    [restart],
  );

  return {
    state: polled.resource,
    error: actionError ?? polled.error,
    isPolling: polled.isPolling,
    unreachable: polled.unreachable,
    busy,
    ask: (questions) =>
      act(() => api.clarifyInterview(sessionId, { questions }), 'Could not ask the interviewer.'),
    probe: () => act(() => api.probeInterview(sessionId), 'Could not open the deep dive.'),
    answer: (text) =>
      act(() => api.answerInterview(sessionId, { text }), 'Could not record your answer.'),
    advance: () => act(() => api.advanceInterview(sessionId), 'Could not move on.'),
    reload: restart,
  };
}
