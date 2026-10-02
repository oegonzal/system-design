import { describe, expect, it } from 'vitest';

import {
  contains,
  NODE_FOOTPRINT,
  NODE_GAP,
  NODE_MIN_FOOTPRINT,
  overlaps,
  type Box,
} from './geometry';
import { boxOf, dropPosition, FALLBACK_ANCHOR, placeBlock } from './placement';
import type { SdNode } from './types';

function block(id: string, x: number, y: number, measured?: { width: number; height: number }) {
  return {
    id,
    type: 'sd',
    position: { x, y },
    ...(measured ? { measured } : {}),
    data: { kind: 'service', label: id },
  } satisfies SdNode;
}

/** What the author can see: a pane's worth of canvas, in flow coordinates. */
const visible: Box = { x: 200, y: 100, width: 700, height: 480 };
const centred = {
  x: visible.x + visible.width / 2 - NODE_FOOTPRINT.width / 2,
  y: visible.y + visible.height / 2 - NODE_FOOTPRINT.height / 2,
};

/** Closer than the gap on both axes: the new block would sit on the other's handles. */
function crowded(position: { x: number; y: number }, nodes: readonly SdNode[]): boolean {
  const grown = {
    x: position.x - NODE_GAP,
    y: position.y - NODE_GAP,
    width: NODE_FOOTPRINT.width + NODE_GAP * 2,
    height: NODE_FOOTPRINT.height + NODE_GAP * 2,
  };
  return nodes.some((node) => overlaps(grown, boxOf(node)));
}

describe('placeBlock', () => {
  it('[UX-2] centres the block in what is visible when nothing is in the way', () => {
    expect(placeBlock([], visible)).toEqual({
      position: centred,
      size: NODE_FOOTPRINT,
      visible: true,
    });
  });

  it('[UX-2] takes the nearest place no block crowds — below first, a whole block plus the gap away', () => {
    const placed = placeBlock([block('n-1', centred.x, centred.y)], visible);

    expect(placed.position).toEqual({
      x: centred.x,
      y: centred.y + NODE_FOOTPRINT.height + NODE_GAP,
    });
    expect(placed.visible).toBe(true);
  });

  it('reads measured sizes: the new block is given the room of the largest on the canvas, a gap clear of it', () => {
    const wide: Box = { ...visible, width: 1000 };
    const middle = {
      x: wide.x + wide.width / 2 - NODE_FOOTPRINT.width / 2,
      y: wide.y + wide.height / 2 - 100,
    };
    const tall = block('n-1', middle.x, middle.y, { width: NODE_FOOTPRINT.width, height: 200 });

    const placed = placeBlock([tall], wide);

    expect(placed.size).toEqual({ width: NODE_FOOTPRINT.width, height: 200 });
    // No room above or below a 200-tall block for another like it: it goes beside it.
    expect(placed.position).toEqual({ x: middle.x + NODE_FOOTPRINT.width + NODE_GAP, y: middle.y });
    expect(placed.visible).toBe(true);
  });

  it('[UX-2] finds the free place on a busy canvas wherever it is — never one out of sight while one is in sight', () => {
    // Three ragged columns of blocks across the visible area, on no grid,
    // with one hole: the right column has nothing in its third row.
    const busy = [
      block('n-1', 205, 110, { width: 180, height: 51 }),
      block('n-2', 215, 200, { width: 200, height: 51 }),
      block('n-3', 205, 290, { width: 190, height: 51 }),
      block('n-4', 210, 380, { width: 200, height: 51 }),
      block('n-5', 210, 470, { width: 195, height: 51 }),
      block('n-6', 430, 120, { width: 150, height: 51 }),
      block('n-7', 440, 205, { width: 190, height: 51 }),
      block('n-8', 425, 295, { width: 200, height: 51 }),
      block('n-9', 440, 385, { width: 180, height: 51 }),
      block('n-10', 430, 470, { width: 200, height: 51 }),
      block('n-11', 660, 110, { width: 132, height: 51 }),
      block('n-12', 670, 200, { width: 180, height: 51 }),
      block('n-13', 665, 380, { width: 200, height: 51 }),
      block('n-14', 660, 470, { width: 220, height: 51 }),
    ];

    const placed = placeBlock(busy, visible);

    expect(placed.visible).toBe(true);
    expect(contains(visible, { ...placed.position, ...placed.size })).toBe(true);
    expect(crowded(placed.position, busy)).toBe(false);
  });

  it('[UX-2] with nothing visible free, takes the nearest free place beside it and says the view has to move', () => {
    // A wall of blocks every 200 × 50 px, far past the visible area on every side.
    const wall = Array.from({ length: 50 }, (_, row) =>
      Array.from({ length: 20 }, (__, col) =>
        block(`n-${row}-${col}`, -1500 + col * 200, -1000 + row * 50),
      ),
    ).flat();

    const placed = placeBlock(wall, visible);

    expect(placed.visible).toBe(false);
    expect(crowded(placed.position, wall)).toBe(false);
  });

  it('a visible area too small for a block has no free place: the block goes beside it', () => {
    const sliver: Box = { x: 0, y: 0, width: NODE_FOOTPRINT.width - 1, height: 400 };

    expect(placeBlock([], sliver).visible).toBe(false);
  });

  it('with no canvas on screen, places around a fresh canvas’s centre and asks nothing of the view', () => {
    const first = placeBlock([], null);
    expect(first.position).toEqual({
      x: FALLBACK_ANCHOR.x - NODE_FOOTPRINT.width / 2,
      y: FALLBACK_ANCHOR.y - NODE_FOOTPRINT.height / 2,
    });
    expect(first.visible).toBe(true);

    const second = placeBlock([block('n-1', first.position.x, first.position.y)], null);
    expect(second.position).toEqual({
      x: first.position.x,
      y: first.position.y + NODE_FOOTPRINT.height + NODE_GAP,
    });
  });
});

describe('dropPosition', () => {
  const pane: Box = { x: 0, y: 0, width: 692, height: 600 };

  it('[UX-2] is the pointer, exactly, anywhere a block fits on the pane', () => {
    expect(dropPosition({ x: 120, y: 80 }, pane)).toEqual({ x: 120, y: 80 });
    expect(dropPosition({ x: 120, y: 80 }, null)).toEqual({ x: 120, y: 80 });
  });

  it('[UX-2] pulls a drop at or past the edge back until a block’s least footprint is on the pane', () => {
    expect(dropPosition({ x: 780, y: 280 }, pane)).toEqual({
      x: pane.width - NODE_MIN_FOOTPRINT.width,
      y: 280,
    });
    expect(dropPosition({ x: -40, y: 590 }, pane)).toEqual({
      x: 0,
      y: pane.height - NODE_MIN_FOOTPRINT.height,
    });
  });
});
