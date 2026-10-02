import { LAYOUT_BLOCK } from '@sysdesign/contracts';

/**
 * How much room a block takes. The numbers are the contract's `LAYOUT_BLOCK`
 * — the one block the API lays a coach's revision out by — so `SdNode` sizes
 * itself, the store places new blocks and a stored graph is laid out by the
 * same block: one can never be drawn wider than any placement assumed.
 */

/** A block's width range: it grows with its label up to `max`, then truncates. */
export const NODE_WIDTH = { min: 132, max: LAYOUT_BLOCK.width } as const;

/**
 * The height assumed for a block React Flow has not measured yet: the icon
 * row's two text lines inside the block's padding, rounded up. Placement
 * reads a measured height whenever there is one.
 */
export const NODE_ASSUMED_HEIGHT = LAYOUT_BLOCK.height;

/** The clear space kept between a placed block and its neighbours: room for a handle and a connection. */
export const NODE_GAP = LAYOUT_BLOCK.gap;

export interface Size {
  width: number;
  height: number;
}

/** A rectangle in flow coordinates: a block, a pill, the part of the canvas on screen. */
export interface Box extends Size {
  x: number;
  y: number;
}

/** The room every block is given until it is measured: as wide as a block can get. */
export const NODE_FOOTPRINT: Size = { width: NODE_WIDTH.max, height: NODE_ASSUMED_HEIGHT };

/** The least a block can take: what must stay on screen for it to be seen and grabbed. */
export const NODE_MIN_FOOTPRINT: Size = { width: NODE_WIDTH.min, height: NODE_ASSUMED_HEIGHT };

/** Whether the two boxes share any area; touching edges do not count. */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether `inner` lies wholly inside `outer`. */
export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** `box` grown by `margin` on every side. */
export function grown(box: Box, margin: number): Box {
  return {
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2,
  };
}
