/**
 * How much room a block takes, declared once. `SdNode` sizes itself from
 * these and the store places new blocks by them, so a block can never be
 * drawn wider than placement assumes.
 */

/** A block's width range: it grows with its label up to `max`, then truncates. */
export const NODE_WIDTH = { min: 132, max: 220 } as const;

/**
 * The height assumed for a block React Flow has not measured yet: the icon
 * row's two text lines inside the block's padding, rounded up. Placement
 * reads a measured height whenever there is one.
 */
export const NODE_ASSUMED_HEIGHT = 56;

/** The clear space kept between a placed block and its neighbours: room for a handle and a connection. */
export const NODE_GAP = 24;
