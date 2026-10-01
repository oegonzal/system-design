'use client';

import { useEffect } from 'react';

import type { CanvasState } from './canvas-store';
import { useCanvasStoreApi } from './canvas-store-context';

/**
 * One keyboard shortcut: the key (as `KeyboardEvent.key`, lower-cased),
 * whether the platform modifier (⌘ or Ctrl) is held, whether Shift must be
 * held (`undefined`: either way), and the store action it runs.
 */
export interface CanvasShortcut {
  key: string;
  mod: boolean;
  shift?: boolean;
  /** Shown beside the control that does the same thing, as `aria-keyshortcuts`. */
  ariaKeys: string;
  /** Whether the key is taken from the page — the browser's own undo must not also run. */
  exclusive: boolean;
  run(state: CanvasState): void;
}

/** The canvas's keyboard map, declared once for the listener and the toolbar's hints. */
export const CANVAS_SHORTCUTS = {
  undo: {
    key: 'z',
    mod: true,
    shift: false,
    ariaKeys: 'Meta+Z Control+Z',
    exclusive: true,
    run: (state) => state.undo(),
  },
  redo: {
    key: 'z',
    mod: true,
    shift: true,
    ariaKeys: 'Meta+Shift+Z Control+Shift+Z',
    exclusive: true,
    run: (state) => state.redo(),
  },
  redoAlternate: {
    key: 'y',
    mod: true,
    shift: false,
    ariaKeys: 'Control+Y',
    exclusive: true,
    run: (state) => state.redo(),
  },
  dismissHighlight: {
    key: 'escape',
    mod: false,
    ariaKeys: 'Escape',
    // Escape stays the page's too: whatever else listens for it still hears it.
    exclusive: false,
    run: (state) => state.clearHighlight(),
  },
} as const satisfies Record<string, CanvasShortcut>;

function matches(shortcut: CanvasShortcut, event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === shortcut.key &&
    (event.metaKey || event.ctrlKey) === shortcut.mod &&
    (shortcut.shift === undefined || event.shiftKey === shortcut.shift) &&
    !event.altKey
  );
}

/**
 * A field keeps its own keys: undo inside a text box is the browser's, and
 * Escape there belongs to the field.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select') !== null)
  );
}

/**
 * Binds the canvas's shortcuts on the document while the canvas is mounted.
 * The store decides what each one may do — undo while read-only is a no-op
 * there, not here.
 */
export function useCanvasShortcuts(): void {
  const storeApi = useCanvasStoreApi();
  useEffect(() => {
    const shortcuts: readonly CanvasShortcut[] = Object.values(CANVAS_SHORTCUTS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const shortcut = shortcuts.find((candidate) => matches(candidate, event));
      if (!shortcut) return;
      if (shortcut.exclusive) event.preventDefault();
      shortcut.run(storeApi.getState());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [storeApi]);
}
