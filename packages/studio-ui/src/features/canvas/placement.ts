import type { XYPosition } from '@xyflow/react';

import { NODE_ASSUMED_HEIGHT, NODE_GAP, NODE_WIDTH } from './geometry';
import type { SdNode } from './types';

/**
 * Where a block goes when the author did not say: the free slot nearest the
 * point they are looking at. Pure, so the store can apply it to every add
 * and a spec can pin it down without a browser.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Where the visible centre is assumed to be when no canvas is on screen to
 * ask: the middle of a fresh canvas at 100% zoom.
 */
export const FALLBACK_ANCHOR: XYPosition = { x: 360, y: 200 };

/** How many rings of slots around the anchor are searched before giving up on a free one. */
const SEARCH_RINGS = 3;

/** A block's box in flow coordinates: as React Flow measured it, or as assumed before it has. */
function boxOf(node: SdNode): Box {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? NODE_WIDTH.max,
    height: node.measured?.height ?? NODE_ASSUMED_HEIGHT,
  };
}

/** Two boxes closer than the gap: a block placed there would sit on the other's handles. */
function crowds(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width + NODE_GAP &&
    b.x < a.x + a.width + NODE_GAP &&
    a.y < b.y + b.height + NODE_GAP &&
    b.y < a.y + a.height + NODE_GAP
  );
}

/** The room a new block is given: the largest any block on the canvas takes, never less than assumed. */
function footprint(nodes: readonly SdNode[]): Size {
  return nodes.reduce<Size>(
    (size, node) => ({
      width: Math.max(size.width, node.measured?.width ?? 0),
      height: Math.max(size.height, node.measured?.height ?? 0),
    }),
    { width: NODE_WIDTH.max, height: NODE_ASSUMED_HEIGHT },
  );
}

/**
 * Slot offsets in slot units, nearest first. Ties go below, then right, then
 * left, then above — a column grows downward from where the author looks.
 */
const SLOT_OFFSETS: readonly (readonly [number, number])[] = (() => {
  const offsets: [number, number][] = [];
  for (let row = -SEARCH_RINGS; row <= SEARCH_RINGS; row += 1) {
    for (let col = -SEARCH_RINGS; col <= SEARCH_RINGS; col += 1) offsets.push([col, row]);
  }
  return offsets.sort(
    ([colA, rowA], [colB, rowB]) =>
      Math.hypot(colA, rowA) - Math.hypot(colB, rowB) || rowB - rowA || colB - colA,
  );
})();

/**
 * The top-left corner for a new block centred as close to `anchor` as the
 * canvas allows. Slots are one block plus the gap apart, so two consecutive
 * adds are always at least a block's height or width apart; a slot any block
 * crowds is skipped. When every searched slot is taken, the anchor itself.
 */
export function freeSlotNear(anchor: XYPosition, nodes: readonly SdNode[]): XYPosition {
  const size = footprint(nodes);
  const origin = { x: anchor.x - size.width / 2, y: anchor.y - size.height / 2 };
  const taken = nodes.map(boxOf);
  for (const [col, row] of SLOT_OFFSETS) {
    const slot = {
      x: origin.x + col * (size.width + NODE_GAP),
      y: origin.y + row * (size.height + NODE_GAP),
    };
    if (!taken.some((box) => crowds({ ...slot, ...size }, box))) return slot;
  }
  return origin;
}
