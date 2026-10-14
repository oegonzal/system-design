'use client';

import type { DesignRevisionSummaryDto, PromptDto, SessionInFlightDto } from '@sysdesign/contracts';
import { useLatestRequest } from '@sysdesign/web-kit';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client';
import type { CanvasStore } from '../canvas/canvas-store';
import { byNewest, latestUserRevision } from './feedback-target';

/** What opening a session hands the page, beside what it put on the canvas. */
export interface OpenedSession {
  prompt: PromptDto;
  /** Newest first. */
  revisions: DesignRevisionSummaryDto[];
  inFlight: SessionInFlightDto | null;
  /** The session's newest coaching run, followed again so a reload mid-coach picks it back up. */
  coachingRunId: string | null;
}

/**
 * Opens a session: session → prompt + revision summaries + coaching runs →
 * the canvas. A saved draft comes back ahead of any revision — it is the
 * author's latest work; without one the latest revision the author wrote
 * loads (the coach's revisions load only when chosen). `onOpened` hears the
 * rest, once, for the request still current.
 *
 * What a read threw is kept whole: the shared notice decides whether nothing
 * lives at this address or another try could succeed. `fail` records the same
 * kind of failure found later, by an action; `retry` opens the session again.
 */
export function useSessionLoad(
  sessionId: string,
  storeApi: CanvasStore,
  onOpened: (opened: OpenedSession) => void,
) {
  const loader = useLatestRequest();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const { id, signal } = loader.begin();
    void (async () => {
      try {
        const session = await api.getSession(sessionId, { signal });
        const [prompt, revisions, coachingRuns] = await Promise.all([
          api.getPrompt(session.promptId, { signal }),
          api.listRevisions(sessionId, { signal }),
          api.listImproveRuns(sessionId, { signal }),
        ]);
        const sorted = [...revisions.data].sort(byNewest);
        const latestUser = latestUserRevision(sorted);
        const draft = session.draft;
        const restored =
          draft === null && latestUser ? await api.getRevision(latestUser.id, { signal }) : null;
        if (!loader.isCurrent(id)) return;

        if (draft !== null) {
          storeApi.getState().loadDraft(draft);
        } else if (restored) {
          storeApi.getState().setGraph(restored.graph);
          storeApi.getState().loadNarrative(restored.narrative);
          storeApi.getState().loadBrief(restored.brief);
        }
        onOpened({
          prompt,
          revisions: sorted,
          inFlight: session.inFlight,
          coachingRunId: coachingRuns[0]?.runId ?? null,
        });
        setLoading(false);
      } catch (error) {
        if (loader.isStale(id, error)) return;
        setFailure(error);
        setLoading(false);
      }
    })();
  }, [sessionId, reloadKey]);

  const retry = useCallback(() => {
    setFailure(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  return { loading, failure, fail: setFailure, retry };
}
