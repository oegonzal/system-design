import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LeaveGuardProvider, useConfirmLeave, useLeaveGuard } from './use-leave-guard';

const wrapper = ({ children }: { children?: ReactNode }) => (
  <LeaveGuardProvider>{children}</LeaveGuardProvider>
);

/** Fires the browser's leave event and answers whether a guard held it. */
function attemptUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * jsdom has no Navigation API: stand in the one thing the guard reads from
 * it — the target `navigate` events are dispatched on.
 */
function installNavigation(): EventTarget {
  const navigation = new EventTarget();
  Object.defineProperty(window, 'navigation', { configurable: true, value: navigation });
  return navigation;
}

interface AttemptedNavigation {
  navigationType?: NavigationType;
  cancelable?: boolean;
  hashChange?: boolean;
}

/** Fires the browser's navigate event — a same-document Back unless told otherwise — and answers whether a guard held it. */
function attemptNavigation(
  navigation: EventTarget,
  { navigationType = 'traverse', cancelable = true, hashChange = false }: AttemptedNavigation = {},
): boolean {
  const event = Object.assign(new Event('navigate', { cancelable }), {
    navigationType,
    hashChange,
  });
  navigation.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'navigation');
});

describe('useLeaveGuard', () => {
  it('holds a reload only while active, and lets go once inactive or unmounted', () => {
    const hook = renderHook(({ active }) => useLeaveGuard(active, 'Still saving.'), {
      initialProps: { active: false },
    });
    expect(attemptUnload()).toBe(false);

    hook.rerender({ active: true });
    expect(attemptUnload()).toBe(true);

    hook.rerender({ active: false });
    expect(attemptUnload()).toBe(false);

    hook.rerender({ active: true });
    hook.unmount();
    expect(attemptUnload()).toBe(false);
  });
});

describe('useConfirmLeave', () => {
  it('answers true at once with nothing blocking, and without a provider at all', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const bare = renderHook(() => useConfirmLeave());
    expect(bare.result.current()).toBe(true);

    const provided = renderHook(() => useConfirmLeave(), { wrapper });
    expect(provided.result.current()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('puts the oldest live blocker to the author and returns their answer', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const page = renderHook(
      ({ saving, dirty }) => {
        useLeaveGuard(dirty, 'Your draft has unsaved changes. Leave anyway?');
        useLeaveGuard(saving, 'Your draft is still being saved. Leave anyway?');
        return useConfirmLeave();
      },
      { wrapper, initialProps: { saving: false, dirty: false } },
    );

    page.rerender({ saving: true, dirty: false });
    expect(page.result.current()).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith('Your draft is still being saved. Leave anyway?');

    confirm.mockReturnValue(true);
    expect(page.result.current()).toBe(true);

    page.rerender({ saving: true, dirty: true });
    expect(page.result.current()).toBe(true);
    // The saving guard registered first, so it is the one asked.
    expect(confirm).toHaveBeenLastCalledWith('Your draft is still being saved. Leave anyway?');

    page.rerender({ saving: false, dirty: true });
    page.result.current();
    expect(confirm).toHaveBeenLastCalledWith('Your draft has unsaved changes. Leave anyway?');

    page.rerender({ saving: false, dirty: false });
    confirm.mockClear();
    expect(page.result.current()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('LeaveGuardProvider', () => {
  const UNSAVED = 'Your draft has unsaved changes. Leave anyway?';

  it('asks before a Back or Forward leaves a blocking page, and holds it when the author refuses', () => {
    const navigation = installNavigation();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const page = renderHook(({ dirty }) => useLeaveGuard(dirty, UNSAVED), {
      wrapper,
      initialProps: { dirty: false },
    });

    // Nothing unsaved: the traversal goes, unasked.
    expect(attemptNavigation(navigation)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();

    page.rerender({ dirty: true });
    expect(attemptNavigation(navigation)).toBe(true);
    expect(confirm).toHaveBeenLastCalledWith(UNSAVED);

    confirm.mockReturnValue(true);
    expect(attemptNavigation(navigation)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('asks only about a traversal it can hold and that leaves the page', () => {
    const navigation = installNavigation();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(() => useLeaveGuard(true, UNSAVED), { wrapper });

    // A link's own navigation asked already, through useConfirmLeave.
    expect(attemptNavigation(navigation, { navigationType: 'push' })).toBe(false);
    expect(attemptNavigation(navigation, { navigationType: 'replace' })).toBe(false);
    // Another document is beforeunload's to ask about; the browser allows no hold here.
    expect(attemptNavigation(navigation, { cancelable: false })).toBe(false);
    // A fragment change stays on the page.
    expect(attemptNavigation(navigation, { hashChange: true })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('stops asking once the shell is gone', () => {
    const navigation = installNavigation();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const page = renderHook(() => useLeaveGuard(true, UNSAVED), { wrapper });
    expect(attemptNavigation(navigation)).toBe(true);

    page.unmount();
    confirm.mockClear();
    expect(attemptNavigation(navigation)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});
