import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLatestRequest } from './use-latest-request';

describe('useLatestRequest', () => {
  it('each begin() supersedes and aborts the previous ticket', () => {
    const { result } = renderHook(() => useLatestRequest());

    const first = result.current.begin();
    const second = result.current.begin();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(result.current.isCurrent(first.id)).toBe(false);
    expect(result.current.isCurrent(second.id)).toBe(true);
  });

  it('a superseded ticket or an abort is stale, never an error', () => {
    const { result } = renderHook(() => useLatestRequest());

    const first = result.current.begin();
    const second = result.current.begin();
    const abort = new DOMException('aborted', 'AbortError');

    expect(result.current.isStale(first.id)).toBe(true);
    expect(result.current.isStale(second.id, abort)).toBe(true);
    expect(result.current.isStale(second.id, new Error('real'))).toBe(false);
  });

  it('aborts the in-flight request on unmount and keeps a stable identity', () => {
    const { result, rerender, unmount } = renderHook(() => useLatestRequest());
    const before = result.current;
    const ticket = result.current.begin();

    rerender();
    expect(result.current).toBe(before);

    unmount();
    expect(ticket.signal.aborted).toBe(true);
  });
});
