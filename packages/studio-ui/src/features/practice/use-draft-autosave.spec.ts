import { stubApi } from '@sysdesign/web-testing';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeGraph } from '../../testing/fixtures';
import { createCanvasStore } from '../canvas/canvas-store';
import { DRAFT_AUTOSAVE_DELAY_MS, useDraftAutosave } from './use-draft-autosave';

const DRAFT_PATH = '/api/sessions/session-1/draft';

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function draftBodies(fetchMock: ReturnType<typeof stubApi>['fetchMock']) {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    .map(
      ([, init]) =>
        JSON.parse(String((init as RequestInit).body)) as { graph: { nodes: unknown[] } },
    );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useDraftAutosave', () => {
  it('[UX-15] saves the draft once the edits settle, reports pending until the save lands, and never saves a clean canvas', async () => {
    const { fetchMock } = stubApi([{ method: 'PUT', path: DRAFT_PATH, status: 204 }]);
    const store = createCanvasStore(makeGraph());
    const hook = renderHook(() => useDraftAutosave('session-1', store, true));

    await advance(DRAFT_AUTOSAVE_DELAY_MS * 2);
    expect(draftBodies(fetchMock)).toHaveLength(0);
    expect(hook.result.current.status).toBe('clean');
    expect(hook.result.current.pending).toBe(false);

    act(() => {
      store.getState().addNode('cache');
    });
    expect(hook.result.current.status).toBe('unsaved');
    expect(hook.result.current.pending).toBe(true);

    await advance(DRAFT_AUTOSAVE_DELAY_MS - 1);
    expect(draftBodies(fetchMock)).toHaveLength(0);
    act(() => {
      store.getState().addNode('queue');
    });
    // The second edit restarts the wait: one save, of the latest draft.
    await advance(DRAFT_AUTOSAVE_DELAY_MS - 1);
    expect(draftBodies(fetchMock)).toHaveLength(0);
    await advance(1);
    expect(draftBodies(fetchMock)).toHaveLength(1);
    expect(draftBodies(fetchMock)[0].graph.nodes).toHaveLength(5);
    expect(hook.result.current.status).toBe('saved');
    expect(hook.result.current.pending).toBe(false);

    act(() => {
      store.getState().markClean();
    });
    expect(hook.result.current.status).toBe('clean');
    await advance(DRAFT_AUTOSAVE_DELAY_MS * 2);
    expect(draftBodies(fetchMock)).toHaveLength(1);
  });

  it('[UX-15] settle() saves what is unsaved at once, and the debounce that follows has nothing left to send', async () => {
    const { fetchMock } = stubApi([{ method: 'PUT', path: DRAFT_PATH, status: 204 }]);
    const store = createCanvasStore(makeGraph());
    const hook = renderHook(() => useDraftAutosave('session-1', store, true));

    act(() => {
      store.getState().addNode('cache');
    });
    await act(async () => {
      await hook.result.current.settle();
    });
    expect(draftBodies(fetchMock)).toHaveLength(1);
    expect(hook.result.current.status).toBe('saved');
    expect(hook.result.current.pending).toBe(false);

    await advance(DRAFT_AUTOSAVE_DELAY_MS * 2);
    expect(draftBodies(fetchMock)).toHaveLength(1);
  });

  it('reports a save that did not land, keeps the draft pending, and retries on the next edit', async () => {
    const { fetchMock } = stubApi([
      {
        method: 'PUT',
        path: DRAFT_PATH,
        handler: ({ count }) =>
          count === 0 ? { status: 500, body: { message: 'boom' } } : { status: 204 },
      },
    ]);
    const store = createCanvasStore(makeGraph());
    const hook = renderHook(() => useDraftAutosave('session-1', store, true));

    act(() => {
      store.getState().addNode('cache');
    });
    await advance(DRAFT_AUTOSAVE_DELAY_MS);
    expect(hook.result.current.status).toBe('failed');
    expect(hook.result.current.pending).toBe(true);

    act(() => {
      store.getState().addNode('queue');
    });
    expect(hook.result.current.status).toBe('unsaved');
    await advance(DRAFT_AUTOSAVE_DELAY_MS);
    expect(draftBodies(fetchMock)).toHaveLength(2);
    expect(hook.result.current.status).toBe('saved');
  });

  it('saves nothing while disabled — a revision on screen is not the draft — and catches up once enabled', async () => {
    const { fetchMock } = stubApi([{ method: 'PUT', path: DRAFT_PATH, status: 204 }]);
    const store = createCanvasStore(makeGraph());
    const hook = renderHook(({ enabled }) => useDraftAutosave('session-1', store, enabled), {
      initialProps: { enabled: false },
    });

    act(() => {
      store.getState().addNode('cache');
    });
    await advance(DRAFT_AUTOSAVE_DELAY_MS * 2);
    expect(draftBodies(fetchMock)).toHaveLength(0);
    expect(hook.result.current.pending).toBe(true);

    hook.rerender({ enabled: true });
    await advance(0);
    expect(draftBodies(fetchMock)).toHaveLength(1);
    expect(hook.result.current.status).toBe('saved');
  });
});
