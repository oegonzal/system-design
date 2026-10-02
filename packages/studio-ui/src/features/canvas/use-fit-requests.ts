'use client';

import { useNodesInitialized, useReactFlow, useStore, type Viewport } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';

import { useCanvasStore, useCanvasStoreApi } from './canvas-store-context';
import { FIT_VIEW_OPTIONS } from './framing';

/** The view a fit produced, and the content it framed. */
interface Framing {
  viewport: Viewport;
  contentVersion: number;
}

const sameView = (a: Viewport, b: Viewport): boolean =>
  a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/**
 * Honours the store's fit requests — a load, the toolbar, the zoom controls.
 *
 * - A request waits until there is something to frame it in and by: the pane
 *   has a size and every block is measured. So one made before the canvas
 *   mounted (a session opening) is honoured once React Flow can frame it,
 *   and never by an empty canvas — a fit left queued there would fire at the
 *   first block dropped and move the view from under the author.
 * - A framed diagram stays framed while its frame settles: when the pane
 *   changes size and the view is still the one the fit left — the author has
 *   not panned, zoomed or edited since — the diagram is framed again for the
 *   new size. A banner that takes its space after a load, or a resized
 *   window, never leaves a block under the minimap.
 * - React Flow forgets what it was asked when the canvas's effects are torn
 *   down (it resets its store — StrictMode replays exactly that at mount), so
 *   what was honoured is forgotten with it and asked again.
 */
export function useFitRequests(): void {
  const store = useCanvasStoreApi();
  const fitRequest = useCanvasStore((state) => state.fitRequest);
  const empty = useCanvasStore((state) => state.nodes.length === 0);
  const { fitView, getViewport } = useReactFlow();
  const measured = useNodesInitialized();
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  const sized = paneWidth > 0 && paneHeight > 0;

  const honoured = useRef(0);
  /** The last fit's result; `pending` while one is on its way. */
  const framing = useRef<Framing | 'pending' | null>(null);
  /** Whether the pane changed size while that fit was on its way. */
  const resizedMeanwhile = useRef(false);

  const frame = useCallback(() => {
    const { contentVersion } = store.getState();
    framing.current = 'pending';
    resizedMeanwhile.current = false;
    void fitView(FIT_VIEW_OPTIONS).then(() => {
      framing.current = { viewport: getViewport(), contentVersion };
      // The pane changed size under the fit: what it framed for is gone.
      if (resizedMeanwhile.current) frame();
    });
  }, [fitView, getViewport, store]);

  useEffect(
    () => () => {
      honoured.current = 0;
      framing.current = null;
    },
    [],
  );

  useEffect(() => {
    if (fitRequest === honoured.current) return;
    if (empty) {
      honoured.current = fitRequest;
      return;
    }
    if (!sized || !measured) return;
    honoured.current = fitRequest;
    frame();
  }, [fitRequest, empty, sized, measured, frame]);

  const framedSize = useRef({ width: paneWidth, height: paneHeight });
  useEffect(() => {
    const before = framedSize.current;
    if (before.width === paneWidth && before.height === paneHeight) return;
    framedSize.current = { width: paneWidth, height: paneHeight };
    const last = framing.current;
    if (last === null || !sized) return;
    if (last === 'pending') {
      resizedMeanwhile.current = true;
      return;
    }
    if (store.getState().contentVersion !== last.contentVersion) return;
    if (!sameView(getViewport(), last.viewport)) return;
    frame();
  }, [paneWidth, paneHeight, sized, frame, getViewport, store]);
}
