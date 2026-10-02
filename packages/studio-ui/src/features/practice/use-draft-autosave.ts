'use client';

import { useDebouncedValue, useLatestRequest, type ApiError } from '@sysdesign/web-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../api/client';
import type { CanvasStore } from '../canvas/canvas-store';
import type { DraftSaveStatus } from '../canvas/draft-status';
import { subjectGone } from '../evaluation/missing-read';

/** How long the canvas must sit still before an edit is saved. */
export const DRAFT_AUTOSAVE_DELAY_MS = 1500;

export interface DraftAutosave {
  status: DraftSaveStatus;
  /** True while an edit has not reached the server: debouncing, in flight, or failed. */
  pending: boolean;
  /** Saves what is unsaved now, without waiting out the debounce; resolves once the server answered. */
  settle(): Promise<void>;
  /**
   * The session no longer exists: the 404 a save was answered with. There is
   * nowhere left to keep the draft, so no save follows it — and the page's
   * subject is gone, which is the page's to say, not a failed save's.
   */
  gone: ApiError | null;
}

type SavePhase = 'idle' | 'saving' | 'saved' | 'failed';

/** A save that did not land: which version, and whether it was the session that was missing rather than the save that failed. */
interface SaveFailure {
  version: number;
  gone: ApiError | null;
}

/**
 * Keeps the unsubmitted canvas on the server as the author works. Every
 * change to the store's `contentVersion` while the canvas is dirty is a new
 * version — so selecting a block, React Flow measuring one, or a finding's
 * highlight is never a draft to save — and so is the canvas turning dirty. A
 * draft restored from the server is the one version that starts out saved:
 * opening a session writes nothing. The
 * version that has sat still for the delay is saved, last write wins, and
 * a newer version supersedes a save still in flight. `settle()` is how a
 * submit or coach start makes sure the server has the latest draft first —
 * and, because it saves the current version, a debounce that fires after
 * it has nothing left to send. Off while a revision is on screen: what is
 * shown then is not the author's draft. A save the server answers with "no
 * such session" is the last one: the session is `gone`, not the save failed.
 */
export function useDraftAutosave(
  sessionId: string,
  storeApi: CanvasStore,
  enabled: boolean,
): DraftAutosave {
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(() => storeApi.getState().dirty);
  const [phase, setPhase] = useState<SavePhase>('idle');
  const [savedVersion, setSavedVersion] = useState(0);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const versionRef = useRef(0);
  const savedRef = useRef(0);
  const goneRef = useRef<ApiError | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const inFlight = useRef<{ target: number; promise: Promise<void> } | null>(null);
  const latest = useLatestRequest();

  useEffect(
    () =>
      storeApi.subscribe((state, previous) => {
        setDirty(state.dirty);
        if (!state.dirty) return;
        if (state.contentVersion === previous.contentVersion && previous.dirty) return;
        versionRef.current += 1;
        setVersion(versionRef.current);
        // A draft the server just handed back is already there: nothing to
        // write until the author edits it.
        if (state.restoredVersion === state.contentVersion) {
          savedRef.current = versionRef.current;
          setSavedVersion(versionRef.current);
        }
      }),
    [storeApi],
  );

  const save = useCallback(
    (target: number): Promise<void> => {
      if (inFlight.current?.target === target) return inFlight.current.promise;
      // Versions only grow: one no newer than what the server holds has nothing
      // to send — and a session that is gone takes nothing at all.
      if (
        goneRef.current !== null ||
        !enabledRef.current ||
        target <= savedRef.current ||
        !storeApi.getState().dirty
      ) {
        return Promise.resolve();
      }
      const { id, signal } = latest.begin();
      setPhase('saving');
      const promise = api
        .saveSessionDraft(sessionId, storeApi.getState().serializeDraft(), { signal })
        .then(() => {
          if (!latest.isCurrent(id)) return;
          savedRef.current = target;
          setSavedVersion(target);
          setFailure(null);
          setPhase('saved');
        })
        .catch((error: unknown) => {
          if (latest.isStale(id, error)) return;
          // A session that is gone is not a save that failed: nothing is in
          // flight any more, and nothing will be.
          const gone = subjectGone(error);
          goneRef.current = gone;
          setFailure({ version: target, gone });
          setPhase(gone === null ? 'failed' : 'idle');
        })
        .finally(() => {
          if (inFlight.current?.target === target) inFlight.current = null;
        });
      inFlight.current = { target, promise };
      return promise;
    },
    [latest, sessionId, storeApi],
  );

  const settledVersion = useDebouncedValue(version, DRAFT_AUTOSAVE_DELAY_MS);
  useEffect(() => {
    if (enabled) void save(settledVersion);
  }, [enabled, settledVersion, save]);

  const settle = useCallback(() => save(versionRef.current), [save]);

  const pending = dirty && (version !== savedVersion || phase === 'saving');
  const failed = failure !== null && failure.gone === null && failure.version === version;
  const status: DraftSaveStatus = !dirty
    ? 'clean'
    : phase === 'saving'
      ? 'saving'
      : failed
        ? 'failed'
        : version !== savedVersion
          ? 'unsaved'
          : 'saved';
  const gone = failure?.gone ?? null;

  return useMemo(() => ({ status, pending, settle, gone }), [status, pending, settle, gone]);
}
