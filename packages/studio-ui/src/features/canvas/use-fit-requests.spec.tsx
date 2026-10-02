/* eslint-disable @eslint-react/hooks-extra/no-unnecessary-use-prefix --
   the mock mirrors @xyflow/react's exported hook names verbatim */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeGraph } from '../../testing/fixtures';
import { createCanvasStore, type CanvasStore } from './canvas-store';
import { CanvasStoreProvider } from './canvas-store-context';
import { FIT_VIEW_OPTIONS } from './framing';
import { useFitRequests } from './use-fit-requests';

/**
 * React Flow as the hook sees it, scripted: whether the pane has a size and
 * the blocks are measured, where the view is, and every fit asked of it —
 * which stays on its way until the spec lands it.
 */
const flow = vi.hoisted(() => {
  const state = {
    measured: false,
    width: 0,
    height: 0,
    viewport: { x: 0, y: 0, zoom: 1 },
    fits: [] as { options: unknown; land: () => void }[],
  };
  const api = {
    fitView: (options: unknown) =>
      new Promise<boolean>((resolve) => {
        state.fits.push({
          options,
          land: () => {
            // A fit moves the view; where to depends on the pane it framed for.
            state.viewport = { x: state.width / 10, y: state.height / 10, zoom: 1 };
            resolve(true);
          },
        });
      }),
    getViewport: () => state.viewport,
  };
  return { state, api };
});

vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  useReactFlow: () => flow.api,
  useNodesInitialized: () => flow.state.measured,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector(flow.state),
}));

function mount(store: CanvasStore, options: { reactStrictMode?: boolean } = {}) {
  return renderHook(() => useFitRequests(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <CanvasStoreProvider store={store}>{children}</CanvasStoreProvider>
    ),
    ...options,
  });
}

/** Lets the newest fit finish, as React Flow would once the blocks are measured. */
async function landFit() {
  await act(async () => {
    flow.state.fits.at(-1)?.land();
    await Promise.resolve();
  });
}

const ready = { measured: true, width: 800, height: 600 };

beforeEach(() => {
  Object.assign(flow.state, {
    measured: false,
    width: 0,
    height: 0,
    viewport: { x: 0, y: 0, zoom: 1 },
    fits: [],
  });
});

describe('useFitRequests', () => {
  it('honours a request made before the canvas mounted — a session opening — once the pane has a size and the blocks are measured, and only once', () => {
    const store = createCanvasStore(makeGraph());
    const hook = mount(store);
    expect(flow.state.fits).toHaveLength(0);

    Object.assign(flow.state, { width: 800, height: 600 });
    hook.rerender();
    expect(flow.state.fits).toHaveLength(0);

    flow.state.measured = true;
    hook.rerender();
    expect(flow.state.fits).toHaveLength(1);
    // Never past 100%, and clear of the band the minimap and controls sit in.
    expect(flow.state.fits[0]?.options).toBe(FIT_VIEW_OPTIONS);

    hook.rerender();
    expect(flow.state.fits).toHaveLength(1);
  });

  it('frames a draft restored into a mounted canvas, and each later request once', async () => {
    Object.assign(flow.state, ready);
    const store = createCanvasStore();
    mount(store);

    act(() => store.getState().loadDraft({ graph: makeGraph(), brief: null, narrative: null }));
    expect(flow.state.fits).toHaveLength(1);
    await landFit();

    act(() => store.getState().requestFit());
    expect(flow.state.fits).toHaveLength(2);
  });

  it('asks nothing of an empty canvas: a fit left waiting there would fire at the first block dropped and move the view', () => {
    Object.assign(flow.state, ready);
    const store = createCanvasStore();
    const hook = mount(store);

    act(() => store.getState().requestFit());
    expect(flow.state.fits).toHaveLength(0);

    // The first block arrives, by a drop: the author's view stays where it is.
    act(() => {
      store.getState().addNode('client', { x: 120, y: 80 });
    });
    hook.rerender();
    expect(flow.state.fits).toHaveLength(0);
  });

  it('frames again when the pane changes size under a framed diagram — a banner taking its space after a load', async () => {
    Object.assign(flow.state, ready);
    const store = createCanvasStore(makeGraph());
    const hook = mount(store);
    expect(flow.state.fits).toHaveLength(1);
    await landFit();

    flow.state.height = 542;
    hook.rerender();
    expect(flow.state.fits).toHaveLength(2);
    await landFit();
    hook.rerender();
    expect(flow.state.fits).toHaveLength(2);
  });

  it('does not lose a resize that lands while the fit is still on its way', async () => {
    Object.assign(flow.state, ready);
    const store = createCanvasStore(makeGraph());
    const hook = mount(store);
    expect(flow.state.fits).toHaveLength(1);

    flow.state.height = 542;
    hook.rerender();
    expect(flow.state.fits).toHaveLength(1);

    await landFit();
    expect(flow.state.fits).toHaveLength(2);
  });

  it('leaves the view alone on a resize once the author has moved it or edited the diagram', async () => {
    Object.assign(flow.state, ready);
    const panned = createCanvasStore(makeGraph());
    const first = mount(panned);
    await landFit();
    flow.state.viewport = { x: -300, y: 40, zoom: 1.5 };
    flow.state.height = 542;
    first.rerender();
    expect(flow.state.fits).toHaveLength(1);
    first.unmount();

    Object.assign(flow.state, { ...ready, fits: [] });
    const edited = createCanvasStore(makeGraph());
    const second = mount(edited);
    await landFit();
    act(() => {
      edited.getState().addNode('cache');
    });
    flow.state.height = 542;
    second.rerender();
    expect(flow.state.fits).toHaveLength(1);
  });

  it('asks again when its effects are replayed — React Flow resets its store then, and forgets the fit it was holding', () => {
    Object.assign(flow.state, ready);
    const store = createCanvasStore(makeGraph());

    mount(store, { reactStrictMode: true });

    // StrictMode mounts, tears down and mounts again: the second ask is the one that lands.
    expect(flow.state.fits).toHaveLength(2);
  });
});
