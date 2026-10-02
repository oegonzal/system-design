import { LAYOUT_BLOCK, type CanvasBox as Box, type CanvasSize as Size } from '@sysdesign/contracts';

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

export type { CanvasSize as Size, CanvasBox as Box } from '@sysdesign/contracts';
/** The box questions and the one free-place search, as the contract declares them for every placer. */
export {
  boxesOverlap as overlaps,
  boxContains as contains,
  grownBox as grown,
  centredOn,
} from '@sysdesign/contracts';

/** The room every block is given until it is measured: as wide as a block can get. */
export const NODE_FOOTPRINT: Size = { width: NODE_WIDTH.max, height: NODE_ASSUMED_HEIGHT };

/** The least a block can take: what must stay on screen for it to be seen and grabbed. */
export const NODE_MIN_FOOTPRINT: Size = { width: NODE_WIDTH.min, height: NODE_ASSUMED_HEIGHT };

/** A block as the canvas holds it once laid out: where it is, and the size it was measured at. */
export interface PlacedBlock {
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
}

/**
 * Every measured block's box, in flow coordinates — what a pill keeps clear
 * of and what a fit frames. A block not yet measured has no box: it is in
 * neither question until it has a size.
 */
export function measuredBoxes(blocks: readonly PlacedBlock[]): Box[] {
  return blocks.flatMap(({ position, measured }) =>
    measured?.width && measured.height
      ? [{ ...position, width: measured.width, height: measured.height }]
      : [],
  );
}
