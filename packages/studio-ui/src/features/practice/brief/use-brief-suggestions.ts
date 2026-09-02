'use client';

import { narrationToProse } from '@sysdesign/contracts';
import { useCallback, useState } from 'react';

import { api, toErrorMessage } from '../../../api/client';
import { useCanvasStoreApi } from '../../canvas/canvas-store-context';
import { useLatestRequest } from '../../../hooks/use-latest-request';

export interface BriefSuggestionsState {
  /** True while a request is in flight. */
  asking: boolean;
  error: string | null;
  /**
   * True once a request has come back with nothing. Distinguishes "not asked
   * yet" from "asked, and the model had nothing" — which reads very differently
   * to someone waiting for help.
   */
  askedAndEmpty: boolean;
  ask(): void;
}

/**
 * Owns the request; the store owns the answer.
 *
 * Proposals land in the canvas store rather than in local state for two
 * reasons: the rows that render them are already store-connected, and a
 * component that fetched its own data could not be storied — the catalog has no
 * network mocking, so every state has to be reachable by seeding a store.
 */
export function useBriefSuggestions(sessionId: string): BriefSuggestionsState {
  const storeApi = useCanvasStoreApi();
  const request = useLatestRequest();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askedAndEmpty, setAskedAndEmpty] = useState(false);

  const ask = useCallback(() => {
    const { id, signal } = request.begin();
    setAsking(true);
    setError(null);
    setAskedAndEmpty(false);

    void (async () => {
      try {
        // The draft as it stands, not the last revision — the design they want
        // help with is the one on screen. The structured narrative is flattened
        // to prose here because the suggester reads the author's words, not the
        // graded projection.
        const graph = storeApi.getState().serialize();
        const narrative = narrationToProse(storeApi.getState().serializeNarrative());
        const result = await api.briefSuggestions(
          sessionId,
          { graph, ...(narrative ? { narrative } : {}) },
          { signal },
        );
        if (!request.isCurrent(id)) return;

        storeApi.getState().loadProposals(result.proposals);
        setAskedAndEmpty(result.proposals.length === 0);
        setAsking(false);
      } catch (caught) {
        if (request.isStale(id, caught)) return;
        setError(toErrorMessage(caught, 'Could not ask for suggestions.'));
        setAsking(false);
      }
    })();
  }, [request, sessionId, storeApi]);

  return { asking, error, askedAndEmpty, ask };
}
