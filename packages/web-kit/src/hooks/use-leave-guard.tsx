'use client';

import { createContext, use, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

/** The registry a page's blockers announce themselves to, and a navigation asks. */
interface LeaveGuardRegistry {
  /** Registers a live blocker; the answer removes it. */
  register(message: string): () => void;
  /** The message of the oldest live blocker, or null when leaving is free. */
  firstActive(): string | null;
}

const LeaveGuardContext = createContext<LeaveGuardRegistry | null>(null);

export interface LeaveGuardProviderProps {
  children?: ReactNode;
}

/**
 * Where a page's "don't leave yet" reasons are kept so that in-app
 * navigation can ask before it goes. One per app shell — a blocker
 * registered under one provider is invisible to another.
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
      firstActive() {
        const first = blockers.current.values().next();
        return first.done ? null : first.value;
      },
    }),
    [],
  );

  return <LeaveGuardContext value={registry}>{children}</LeaveGuardContext>;
}

/**
 * Blocks leaving while `active`: the browser's own prompt on a reload, tab
 * close or external navigation (`beforeunload`, attached only while active,
 * so an idle page never nags), and `message` for `useConfirmLeave` to put
 * to the author on an in-app navigation. Works without a provider — the
 * browser half needs none.
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
 * cancel the navigation on false.
 */
export function useConfirmLeave(): () => boolean {
  const registry = use(LeaveGuardContext);
  return useCallback(() => {
    const blocking = registry?.firstActive() ?? null;
    return blocking === null || window.confirm(blocking);
  }, [registry]);
}
