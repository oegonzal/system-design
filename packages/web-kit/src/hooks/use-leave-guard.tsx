'use client';

import { createContext, use, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

/** The registry a page's blockers announce themselves to, and a navigation asks. */
interface LeaveGuardRegistry {
  /** Registers a live blocker; the answer removes it. */
  register(message: string): () => void;
  /**
   * Whether a leave may go ahead: true at once when nothing is blocking,
   * otherwise the author's answer to the oldest live blocker's message.
   */
  mayLeave(): boolean;
}

const LeaveGuardContext = createContext<LeaveGuardRegistry | null>(null);

export interface LeaveGuardProviderProps {
  children?: ReactNode;
}

/**
 * Holds a Back or Forward that stays in this document until `mayLeave` says
 * go. A link asks before it navigates; a traversal has no handler to ask
 * from, so the browser's own `navigate` event is where it is asked — before
 * the URL moves, so a refusal leaves the router with nothing to undo.
 *
 * Only what the browser lets a page hold is held. A traversal to another
 * document is not cancelable here and is `beforeunload`'s to ask about; a
 * fragment change leaves no page; and after one refusal the browser lets
 * the next Back through unless the author has touched the page since, so a
 * page can never trap its reader. A browser without the Navigation API
 * keeps the link and `beforeunload` halves and nothing else.
 */
function guardTraversals(mayLeave: () => boolean): () => void {
  if (!('navigation' in window)) return () => undefined;
  const { navigation } = window;
  const onNavigate = (event: NavigateEvent) => {
    if (event.navigationType !== 'traverse' || !event.cancelable || event.hashChange) return;
    if (!mayLeave()) event.preventDefault();
  };
  navigation.addEventListener('navigate', onNavigate);
  return () => navigation.removeEventListener('navigate', onNavigate);
}

/**
 * Where a page's "don't leave yet" reasons are kept so that in-app
 * navigation can ask before it goes — a link through `useConfirmLeave`, and
 * the browser's Back and Forward through the provider itself. One per app
 * shell — a blocker registered under one provider is invisible to another.
 */
export function LeaveGuardProvider({ children }: LeaveGuardProviderProps) {
  const blockers = useRef(new Map<number, string>());
  const nextId = useRef(0);

  const registry = useMemo<LeaveGuardRegistry>(
    () => ({
      register(message) {
        const id = nextId.current++;
        blockers.current.set(id, message);
        return () => {
          blockers.current.delete(id);
        };
      },
      mayLeave() {
        const oldest = blockers.current.values().next();
        return oldest.done === true || window.confirm(oldest.value);
      },
    }),
    [],
  );

  useEffect(() => guardTraversals(registry.mayLeave), [registry]);

  return <LeaveGuardContext value={registry}>{children}</LeaveGuardContext>;
}

/**
 * Blocks leaving while `active`: the browser's own prompt on a reload, tab
 * close or external navigation (`beforeunload`, attached only while active,
 * so an idle page never nags), and `message` for the provider to put to the
 * author on an in-app navigation — a link that asks `useConfirmLeave`, or
 * the browser's Back and Forward. Works without a provider — the
 * `beforeunload` half needs none.
 */
export function useLeaveGuard(active: boolean, message: string): void {
  const registry = use(LeaveGuardContext);

  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const unregister = registry?.register(message);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unregister?.();
    };
  }, [active, message, registry]);
}

/**
 * Asks whether an in-app navigation may go ahead: true at once when nothing
 * is blocking (or no provider is mounted), otherwise the author's answer to
 * the oldest blocker's message. Call it from a link's navigate handler and
 * cancel the navigation on false. Back and Forward need no call — the
 * provider asks for them.
 */
export function useConfirmLeave(): () => boolean {
  const registry = use(LeaveGuardContext);
  return useCallback(() => registry?.mayLeave() ?? true, [registry]);
}
