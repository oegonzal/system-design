'use client';

import {
  practiceFormat,
  type InterviewStateDto,
  type PromptDto,
  type SessionViewDto,
} from '@sysdesign/contracts';
import { useCallback, useRef, useState } from 'react';

import { api } from '../../api/client';
import type { InterviewPanelProps } from './interview/interview-panel';

/**
 * The prompt as the server lets this session see it: whole for most formats;
 * for an interview, its first section and the criteria disclosed so far. The
 * projection moves as the interviewer discloses and when the design is
 * submitted, so it is read again at those moments rather than guessed at.
 */
export function useSessionView(sessionId: string) {
  const [view, setView] = useState<SessionViewDto | null>(null);
  const disclosedSoFar = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView((await api.getSession(sessionId)).view);
    } catch {
      // The next load or poll reports what is wrong; the view on screen stands.
    }
  }, [sessionId]);

  /** Each interview read: when the disclosed count moved, the projection did too. */
  const onInterviewState = useCallback(
    (state: InterviewStateDto) => {
      const disclosed = state.turns.reduce(
        (sum, turn) => sum + turn.disclosesCriterionIds.length,
        0,
      );
      if (disclosedSoFar.current !== null && disclosedSoFar.current !== disclosed) void refresh();
      disclosedSoFar.current = disclosed;
    },
    [refresh],
  );

  return { view, setView, refresh, onInterviewState };
}

/** The interview tab's props for a session whose format declares phases; null for every other — read from the format's row, never its id. */
export function interviewPanelFor(
  sessionId: string,
  prompt: PromptDto | null,
  readOnly: boolean,
  onState: (state: InterviewStateDto) => void,
): InterviewPanelProps | null {
  const format = prompt === null ? null : practiceFormat(prompt.format);
  return format !== null && format.phases.length > 0
    ? { sessionId, format, readOnly, onState }
    : null;
}
