'use client';

import { createContext, use, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';

import { createCanvasStore, type CanvasState, type CanvasStore } from './canvas-store';

const CanvasStoreContext = createContext<CanvasStore | null>(null);

export interface CanvasStoreProviderProps {
  children?: ReactNode;
  /** Inject a pre-seeded store — the test and Storybook seam. */
  store?: CanvasStore;
}

/**
 * One vanilla store per mounted provider (a `useState` initializer, so
 * StrictMode's double-invoke cannot mint two). Module-level store instances
 * are the bug this file exists to prevent: they would share one graph across
 * every session ever opened in the tab.
 */
export function CanvasStoreProvider({ children, store }: CanvasStoreProviderProps) {
  const [value] = useState(() => store ?? createCanvasStore());
  return <CanvasStoreContext value={value}>{children}</CanvasStoreContext>;
}

/** The raw store — for imperative reads (serialize on submit) and actions in callbacks. */
export function useCanvasStoreApi(): CanvasStore {
  const store = use(CanvasStoreContext);
  if (!store) throw new Error('useCanvasStoreApi must be used inside <CanvasStoreProvider>');
  return store;
}

/** Subscribing selector hook — the render-path way to read the store. */
export function useCanvasStore<T>(selector: (state: CanvasState) => T): T {
  return useStore(useCanvasStoreApi(), selector);
}
