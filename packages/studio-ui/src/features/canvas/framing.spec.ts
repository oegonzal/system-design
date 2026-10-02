import type { Viewport } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { FIT_PADDING, FIT_ZOOM, frameFor, PANEL_BAND, revealShift, viewArea } from './framing';
import type { Box, Size } from './geometry';

describe('viewArea', () => {
  it('is null while the pane has no size', () => {
    expect(viewArea({ width: 0, height: 600 }, [0, 0, 1])).toBeNull();
  });

  it('is the pane in flow coordinates, and the part of it the panels do not float over', () => {
    expect(viewArea({ width: 800, height: 600 }, [0, 0, 1])).toEqual({
      pane: { x: 0, y: 0, width: 800, height: 600 },
      clear: { x: 0, y: 0, width: 800, height: 600 - PANEL_BAND },
    });
  });

  it('follows the pan and the zoom', () => {
    // Panned 100 right and 50 down, at 200%: half as much canvas, starting left of and above the origin.
    expect(viewArea({ width: 800, height: 600 }, [100, 50, 2])).toEqual({
      pane: { x: -50, y: -25, width: 400, height: 300 },
      clear: { x: -50, y: -25, width: 400, height: (600 - PANEL_BAND) / 2 },
    });
  });

  it('has no clear part when the pane is no taller than the panels’ band', () => {
    expect(viewArea({ width: 800, height: PANEL_BAND - 1 }, [0, 0, 1])?.clear.height).toBe(0);
  });
});

describe('revealShift', () => {
  const area = { x: 0, y: 0, width: 800, height: 500 };

  it('is nothing for a box already in view', () => {
    expect(revealShift({ x: 100, y: 100, width: 220, height: 56 }, area)).toEqual({ x: 0, y: 0 });
  });

  it('is the overhang, per axis, for a box past an edge — the least move that shows it', () => {
    expect(revealShift({ x: 700, y: 100, width: 220, height: 56 }, area)).toEqual({ x: 120, y: 0 });
    expect(revealShift({ x: -30, y: 480, width: 220, height: 56 }, area)).toEqual({
      x: -30,
      y: 36,
    });
  });

  it('centres a box too large for the area', () => {
    expect(revealShift({ x: 0, y: 100, width: 1000, height: 56 }, area)).toEqual({ x: 100, y: 0 });
  });
});

describe('frameFor', () => {
  /** The laptop pane the reports measured: 691 × 597 px. */
  const pane: Size = { width: 691, height: 597 };
  const block = (x: number, y: number): Box => ({ x, y, width: 160, height: 56 });

  /** Whether the block is drawn wholly inside the frame a fit keeps clear — on screen, off the minimap's band. */
  const framed = (box: Box, view: Viewport | null, size: Size = pane): boolean => {
    if (view === null) return false;
    const left = box.x * view.zoom + view.x;
    const top = box.y * view.zoom + view.y;
    return (
      left >= FIT_PADDING.left - 0.5 &&
      top >= FIT_PADDING.top - 0.5 &&
      left + box.width * view.zoom <= size.width - FIT_PADDING.right + 0.5 &&
      top + box.height * view.zoom <= size.height - FIT_PADDING.bottom + 0.5
    );
  };

  it('is null with nothing to frame, or no pane to frame it in', () => {
    expect(frameFor([], pane)).toBeNull();
    expect(frameFor([block(0, 0)], { width: 0, height: 597 })).toBeNull();
  });

  it('frames a lone block at 100%, centred across the pane and clear of the minimap’s band — never blown up', () => {
    const view = frameFor([block(400, 300)], pane);

    expect(view?.zoom).toBe(FIT_ZOOM.max);
    expect(framed(block(400, 300), view)).toBe(true);
    expect(view?.x).toBeCloseTo((pane.width - 160) / 2 - 400);
  });

  it('frames a diagram that fits whole, as large as it fits', () => {
    const blocks = [block(0, 0), block(700, 0), block(0, 500), block(700, 500)];

    const view = frameFor(blocks, pane);

    expect(view?.zoom).toBeLessThan(FIT_ZOOM.max);
    expect(view?.zoom).toBeGreaterThanOrEqual(FIT_ZOOM.min);
    expect(blocks.every((box) => framed(box, view))).toBe(true);
  });

  it('frames the cluster, not the empty middle, when one far block puts the whole past the zoom floor — a session never opens on a blank canvas', () => {
    // Twenty-five blocks in a 5 × 5 grid near the origin, and one dropped 3,000 units away.
    const cluster = Array.from({ length: 25 }, (_, index) =>
      block((index % 5) * 220, Math.floor(index / 5) * 150),
    );
    const far = block(3623, 2633);

    const view = frameFor([...cluster, far], pane);

    // The whole cluster fits the frame at the floor, so all of it is shown; the far block is off.
    expect(view?.zoom).toBe(FIT_ZOOM.min);
    expect(cluster.every((box) => framed(box, view))).toBe(true);
    expect(framed(far, view)).toBe(false);
  });

  it('keeps the top of a diagram too tall for the floor on screen, and lets the rest run off past the bottom', () => {
    // A column 844 units tall in a pane whose frame holds 758 at 50% — the revision view under its banner.
    const column = [0, 197, 394, 591, 788].map((y) => block(200, y));
    const short: Size = { width: 691, height: 538 };

    const view = frameFor(column, short);

    expect(view?.zoom).toBe(FIT_ZOOM.min);
    expect(column.slice(0, 4).every((box) => framed(box, view, short))).toBe(true);
    // The block that does not fit is below the rest, not above.
    const last = column.at(-1) ?? column[0];
    expect((last?.y ?? 0) * FIT_ZOOM.min + (view?.y ?? 0)).toBeGreaterThan(FIT_PADDING.top);
  });

  it('keeps the left of a diagram too wide for the floor on screen', () => {
    const row = [0, 300, 600, 900, 1200, 1500].map((x) => block(x, 100));

    const view = frameFor(row, pane);

    expect(view?.zoom).toBe(FIT_ZOOM.min);
    expect(framed(row[0] ?? block(0, 100), view)).toBe(true);
  });

  it('keeps the entry block on screen even where a lower row holds more blocks', () => {
    // One block on top, five in the bottom row 844 units down: a window can hold the top or the bottom row, not both.
    const entry = block(800, 0);
    const middle = [block(600, 300), block(1000, 300)];
    const bottom = [0, 300, 600, 900, 1200].map((x) => block(x, 788));
    const short: Size = { width: 691, height: 538 };

    const view = frameFor([...bottom, ...middle, entry], short);

    expect(view?.zoom).toBe(FIT_ZOOM.min);
    expect(framed(entry, view, short)).toBe(true);
    expect(middle.every((box) => framed(box, view, short))).toBe(true);
  });

  it('opens where the diagram is read from: of two clusters too far apart to frame together, the upper one', () => {
    const upper = [block(2000, 0), block(2220, 0)];
    const lower = [block(0, 3000), block(220, 3000), block(440, 3000)];

    const view = frameFor([...lower, ...upper], pane);

    expect(upper.every((box) => framed(box, view))).toBe(true);
    expect(lower.some((box) => framed(box, view))).toBe(false);
  });
});
