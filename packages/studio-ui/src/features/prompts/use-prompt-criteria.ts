'use client';

import type { PromptDto, SuccessCriterion } from '@sysdesign/contracts';
import { toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';

export interface PromptCriteriaState {
  /** The rubric in force: freshly derived when it was, the prompt's own otherwise. */
  criteria: SuccessCriterion[];
  deriving: boolean;
  /** The grader was unavailable (502/503) or refused (409) — the criteria stay as they were. */
  error: string | null;
  /** Ask the quality loop for the rubric again. */
  derive(): void;
}

const NONE: SuccessCriterion[] = [];

/**
 * The prompt's rubric, derived by the quality loop and kept for the prompt's
 * life. A prompt that arrives without criteria is derived ONCE per prompt id
 * — never in a loop, because a grader that is down stays down for the next
 * tick too — and the author can ask again by hand. The derived rubric
 * shadows the prompt's own for as long as that prompt is the one on screen.
 */
export function usePromptCriteria(prompt: PromptDto | null): PromptCriteriaState {
  const [derived, setDerived] = useState<{ promptId: string; criteria: SuccessCriterion[] } | null>(
    null,
  );
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedFor = useRef<string | null>(null);
  const request = useLatestRequest();
  const promptId = prompt?.id ?? null;

  const derive = useCallback(() => {
    if (promptId === null) return;
    const { id, signal } = request.begin();
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       reached from the arrival effect on purpose: a prompt that arrives without
       a rubric asks for it once, and that request is this hook's contract */
    setDeriving(true);
    setError(null);
    void api
      .derivePromptCriteria(promptId, { signal })
      .then((updated) => {
        if (!request.isCurrent(id)) return;
        setDerived({ promptId: updated.id, criteria: updated.criteria });
        setDeriving(false);
      })
      .catch((caught: unknown) => {
        if (request.isStale(id, caught)) return;
        setError(toErrorMessage(caught, 'The grader is unavailable.'));
        setDeriving(false);
      });
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
  }, [promptId, request]);

  const arrivedEmpty = prompt !== null && prompt.criteria.length === 0;
  useEffect(() => {
    if (promptId === null || !arrivedEmpty) return;
    if (attemptedFor.current === promptId) return;
    attemptedFor.current = promptId;
    derive();
  }, [promptId, arrivedEmpty, derive]);

  const criteria =
    derived !== null && derived.promptId === promptId
      ? derived.criteria
      : (prompt?.criteria ?? NONE);

  return { criteria, deriving, error, derive };
}
