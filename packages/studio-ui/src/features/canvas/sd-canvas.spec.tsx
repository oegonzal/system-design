import { COLOR_MODES, DEFAULT_APPEARANCE_SETTINGS, type ColorMode } from '@sysdesign/contracts';
import { createTheme } from '@sysdesign/design-system';
import { renderWithTheme } from '@sysdesign/web-testing';
import { act, createEvent, fireEvent, screen } from '@testing-library/react';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { makeGraph } from '../../testing/fixtures';
import { createCanvasStore, type CanvasStore } from './canvas-store';
import { CanvasStoreProvider } from './canvas-store-context';
import { viewArea } from './framing';
import { NODE_MIN_FOOTPRINT } from './geometry';
import { NODE_DRAG_MIME } from './palette/palette';
import { SdCanvas } from './sd-canvas';

/** The pane as the jsdom shims size it. */
const PANE = { width: 800, height: 600 };

type FlowStore = ReturnType<typeof useStoreApi>;

/** The canvas as the workspace mounts it — inside the page's React Flow provider — plus a handle on React Flow's own store. */
function mountCanvas(store: CanvasStore, settings?: { colorMode: ColorMode }) {
  const handle: { flow: FlowStore | null } = { flow: null };
  function Probe() {
    handle.flow = useStoreApi();
    return null;
  }
  renderWithTheme(
    <ReactFlowProvider>
      <CanvasStoreProvider store={store}>
        <SdCanvas />
        <Probe />
      </CanvasStoreProvider>
    </ReactFlowProvider>,
    { settings },
  );
  const flow = () => {
    if (!handle.flow) throw new Error('React Flow store not captured');
    return handle.flow.getState();
  };
  const surface = () => {
    const element = screen.getByTestId('sd-canvas').querySelector<HTMLElement>('.react-flow');
    if (!element) throw new Error('React Flow did not render');
    return element;
  };
  return { flow, surface };
}

/** The palette's drag, let go at a point on the pane: the event the canvas's drop handler reads. */
function dropBlock(surface: HTMLElement, kind: string, at: { x: number; y: number }) {
  const event = createEvent.drop(surface, {
    dataTransfer: { getData: (type: string) => (type === NODE_DRAG_MIME ? kind : '') },
  });
  Object.defineProperties(event, {
    clientX: { value: at.x },
    clientY: { value: at.y },
  });
  fireEvent(surface, event);
}

describe('SdCanvas', () => {
  it('[UX-2] a block dropped on an empty canvas lands under the pointer and the view stays put — on the first drop, and on the ones after it', () => {
    const store = createCanvasStore();
    const { flow, surface } = mountCanvas(store);

    dropBlock(surface(), 'client', { x: 120, y: 80 });
    expect(store.getState().nodes.map((node) => node.position)).toEqual([{ x: 120, y: 80 }]);
    expect(flow().transform).toEqual([0, 0, 1]);
    expect(flow().fitViewQueued).toBe(false);

    dropBlock(surface(), 'gateway', { x: 380, y: 80 });
    dropBlock(surface(), 'database', { x: 520, y: 280 });
    expect(store.getState().nodes.map((node) => node.position)).toEqual([
      { x: 120, y: 80 },
      { x: 380, y: 80 },
      { x: 520, y: 280 },
    ]);
    expect(flow().transform).toEqual([0, 0, 1]);
  });

  it('[UX-2] asking an empty canvas to fit — from the toolbar or the zoom controls — leaves nothing waiting to move the view at the first drop', async () => {
    const store = createCanvasStore();
    const { flow, surface } = mountCanvas(store);

    act(() => store.getState().requestFit());
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }));
    expect(store.getState().fitRequest).toBe(2);
    expect(flow().fitViewQueued).toBe(false);

    dropBlock(surface(), 'client', { x: 120, y: 80 });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(flow().fitViewQueued).toBe(false);
    expect(flow().transform).toEqual([0, 0, 1]);
    expect(store.getState().nodes[0]?.position).toEqual({ x: 120, y: 80 });
  });

  it('[UX-2] a drop at or past the pane’s edge is pulled back onto the pane, so a later drop is never out of sight', () => {
    const store = createCanvasStore();
    const { surface } = mountCanvas(store);

    dropBlock(surface(), 'service', { x: 780, y: 280 });
    dropBlock(surface(), 'cache', { x: 900, y: 590 });

    expect(store.getState().nodes.map((node) => node.position)).toEqual([
      { x: PANE.width - NODE_MIN_FOOTPRINT.width, y: 280 },
      { x: PANE.width - NODE_MIN_FOOTPRINT.width, y: PANE.height - NODE_MIN_FOOTPRINT.height },
    ]);
  });

  it('ignores a drop of anything that is not a palette block, and every drop while read-only', () => {
    const store = createCanvasStore();
    const { surface } = mountCanvas(store);

    dropBlock(surface(), 'not-a-kind', { x: 100, y: 100 });
    act(() => store.getState().setReadOnly(true));
    dropBlock(surface(), 'client', { x: 100, y: 100 });

    expect(store.getState().nodes).toEqual([]);
  });

  it('lends the store its view of the screen while mounted', () => {
    const store = createCanvasStore();
    mountCanvas(store);

    expect(store.getState().viewport?.area()).toEqual(viewArea(PANE, [0, 0, 1]));
  });

  it('a click on the empty pane clears the selection — the properties panel shows nothing, and nothing on the canvas is marked', () => {
    const store = createCanvasStore(makeGraph());
    const { surface } = mountCanvas(store);
    act(() => store.getState().select('e-2'));
    expect(store.getState().selectedId).toBe('e-2');

    const pane = surface().querySelector<HTMLElement>('.react-flow__pane');
    if (!pane) throw new Error('no pane');
    fireEvent.click(pane);

    expect(store.getState().selectedId).toBeNull();
    const marked = [...store.getState().nodes, ...store.getState().edges].filter(
      (element) => element.selected,
    );
    expect(marked).toEqual([]);
  });

  it.each(COLOR_MODES)(
    'paints React Flow’s surface from the theme in %s mode, never from its own palette',
    (colorMode) => {
      const theme = createTheme({ ...DEFAULT_APPEARANCE_SETTINGS, colorMode });
      const { surface } = mountCanvas(createCanvasStore(), { colorMode });

      const frame = screen.getByTestId('sd-canvas');
      expect(getComputedStyle(frame).getPropertyValue('--xy-background-color')).toBe(
        theme.color.bg.surface,
      );
      expect(surface().classList.contains(colorMode)).toBe(true);
    },
  );
});
