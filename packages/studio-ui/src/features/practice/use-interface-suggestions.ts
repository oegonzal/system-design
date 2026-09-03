'use client';

import { narrationToProse } from '@sysdesign/contracts';
import { useCallback, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { useCanvasStoreApi } from '../canvas/canvas-store-context';
import { useLatestRequest } from '../../hooks/use-latest-request';

export interface InterfaceSuggestionsState {
  /** True while a request is in flight. */
  asking: boolean;
  error: string | null;
  /** The node the last empty answer was about, so the panel can say so beside it. */
  askedAndEmptyFor: string | null;
  ask(nodeId: string): void;
}

/**
 * The sibling of `useBriefSuggestions`, with the same division of labour: the
 * hook owns the request, the store owns the answer. Proposals land in the
 * store's `interfaceProposals` slice — beside the node they are about, never
 * on it — so the properties panel that renders them stays store-connected and
 * storyable, and an unaccepted item can never be serialized.
 */
export function useInterfaceSuggestions(sessionId: string): InterfaceSuggestionsState {
  const storeApi = useCanvasStoreApi();
  const request = useLatestRequest();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askedAndEmptyFor, setAskedAndEmptyFor] = useState<string | null>(null);

  const ask = useCallback(
    (nodeId: string) => {
      const { id, signal } = request.begin();
      setAsking(true);
      setError(null);
      setAskedAndEmptyFor(null);

      void (async () => {
        try {
          // The draft on screen, not the last revision — the component they
          // want advice on is the one they are looking at.
          const graph = storeApi.getState().serialize();
          const narrative = narrationToProse(storeApi.getState().serializeNarrative());
          const result = await api.interfaceSuggestions(
            sessionId,
            { graph, nodeId, ...(narrative ? { narrative } : {}) },
            { signal },
          );
          if (!request.isCurrent(id)) return;

          storeApi.getState().loadInterfaceProposals(nodeId, result.proposals);
          setAskedAndEmptyFor(result.proposals.length === 0 ? nodeId : null);
          setAsking(false);
        } catch (caught) {
          if (request.isStale(id, caught)) return;
          setError(toErrorMessage(caught, 'Could not ask for suggestions.'));
          setAsking(false);
        }
      })();
    },
    [request, sessionId, storeApi],
  );

  return { asking, error, askedAndEmptyFor, ask };
}
