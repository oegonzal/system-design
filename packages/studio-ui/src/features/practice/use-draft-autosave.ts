'use client';

import { useDebouncedValue, useLatestRequest } from '@sysdesign/web-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../api/client';
import type { CanvasState, CanvasStore } from '../canvas/canvas-store';
import type { DraftSaveStatus } from '../canvas/draft-status';

/** How long the canvas must sit still before an edit is saved. */
export const DRAFT_AUTOSAVE_DELAY_MS = 1500;

export interface DraftAutosave {
  status: DraftSaveStatus;
  /** True while an edit has not reached the server: debouncing, in flight, or failed. */
  pending: boolean;
  /** Saves what is unsaved now, without waiting out the debounce; resolves once the server answered. */
  settle(): Promise<void>;
}

/** The store slices a draft is made of — a change to any of them is a new version of it. */
const DRAFT_SLICES = [
  'nodes',
  'edges',
  'bindings',
  'narrativeOverview',
  'componentRationales',
  'criterionNarrations',
] as const satisfies readonly (keyof CanvasState)[];

const draftChanged = (state: CanvasState, previous: CanvasState): boolean =>
  DRAFT_SLICES.some((slice) => state[slice] !== previous[slice]);

type SavePhase = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * Keeps the unsubmitted canvas on the server as the author works. Every
 * change to a draft slice while the canvas is dirty is a new version; the
 * version that has sat still for the delay is saved, last write wins, and
 * a newer version supersedes a save still in flight. `settle()` is how a
 * submit or coach start makes sure the server has the latest draft first —
 * and, because it saves the current version, a debounce that fires after
 * it has nothing left to send. Off while a revision is on screen: what is
 * shown then is not the author's draft.
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
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const versionRef = useRef(0);
  const savedRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const inFlight = useRef<{ target: number; promise: Promise<void> } | null>(null);
  const latest = useLatestRequest();

  useEffect(
    () =>
      storeApi.subscribe((state, previous) => {
        setDirty(state.dirty);
        if (state.dirty && (draftChanged(state, previous) || !previous.dirty)) {
          versionRef.current += 1;
          setVersion(versionRef.current);
        }
      }),
    [storeApi],
  );

  const save = useCallback(
    (target: number): Promise<void> => {
      if (inFlight.current?.target === target) return inFlight.current.promise;
      if (!enabledRef.current || target === savedRef.current || !storeApi.getState().dirty) {
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
          setFailedVersion(null);
          setPhase('saved');
        })
        .catch((error: unknown) => {
          if (latest.isStale(id, error)) return;
          setFailedVersion(target);
          setPhase('failed');
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
  const status: DraftSaveStatus = !dirty
    ? 'clean'
    : phase === 'saving'
      ? 'saving'
      : failedVersion === version
        ? 'failed'
        : version !== savedVersion
          ? 'unsaved'
          : 'saved';

  return useMemo(() => ({ status, pending, settle }), [status, pending, settle]);
}
