import type { ApiListResponse } from '@sysdesign/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../http/request';
import { usePagedList, type PageRequest } from './use-paged-list';

const ROWS = ['a', 'b', 'c', 'd', 'e'];
const OPTIONS = { pageSize: 2, fallback: 'Could not load the rows.' };

/** A server of `rows`, paged as asked; `fail` makes the next answer a failure. */
function server(rows: readonly string[]) {
  const asked: PageRequest[] = [];
  const state = { fail: null as unknown };
  const load = async (page: PageRequest): Promise<ApiListResponse<string>> => {
    asked.push(page);
    if (state.fail !== null) {
      const failure = state.fail;
      state.fail = null;
      throw failure;
    }
    return {
      data: rows.slice(page.offset, page.offset + page.limit),
      meta: { total: rows.length, limit: page.limit, offset: page.offset },
    };
  };
  return { asked, state, load };
}

describe('usePagedList', () => {
  it('loads the first page, appends the next on demand, and knows when it has them all', async () => {
    const api = server(ROWS);
    const { result } = renderHook(() => usePagedList(api.load, [], OPTIONS));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b']));
    expect(result.current.total).toBe(5);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c', 'd']));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual(ROWS));
    expect(result.current.hasMore).toBe(false);
    expect(api.asked).toEqual([
      { limit: 2, offset: 0 },
      { limit: 2, offset: 2 },
      { limit: 2, offset: 4 },
    ]);
  });

  it('starts over when the query changes, and drops rows from a query whose first page failed', async () => {
    const api = server(ROWS);
    const { result, rerender } = renderHook(
      ({ query }) => usePagedList((page) => api.load(page), [query], OPTIONS),
      { initialProps: { query: 'one' } },
    );
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b']));

    api.state.fail = new TypeError('Failed to fetch');
    rerender({ query: 'two' });
    await waitFor(() => expect(result.current.error).toBe('Could not load the rows.'));
    // Rows from the old query never stand under the new one.
    expect(result.current.items).toBeNull();
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b']));
    expect(result.current.error).toBeNull();
  });

  it('keeps the rows it has when a further page fails, and loads it on the next ask', async () => {
    const api = server(ROWS);
    const { result } = renderHook(() => usePagedList(api.load, [], OPTIONS));
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b']));

    api.state.fail = new ApiError(503, { statusCode: 503, message: 'The store is down' });
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBe('The store is down'));
    expect(result.current.items).toEqual(['a', 'b']);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c', 'd']));
    expect(result.current.error).toBeNull();
  });
});
