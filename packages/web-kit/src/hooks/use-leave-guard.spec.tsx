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

afterEach(() => {
  vi.restoreAllMocks();
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
