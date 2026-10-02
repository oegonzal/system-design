import type { XYPosition } from '@xyflow/react';

import { revealShift } from './framing';
import {
  contains,
  grown,
  NODE_FOOTPRINT,
  NODE_GAP,
  NODE_MIN_FOOTPRINT,
  overlaps,
  type Box,
  type Size,
} from './geometry';
import type { SdNode } from './types';

/**
 * Where a block goes. When the author did not say: the free place nearest
 * the middle of what they can see, and beside it only when nothing they can
 * see is free. When they did (a drop): where they let go of it. Pure, so the
 * store can apply it to every add and a spec can pin it down without a
 * browser.
 */

/**
 * Where the visible centre is assumed to be when no canvas is on screen to
 * ask: the middle of a fresh canvas at 100% zoom.
 */
export const FALLBACK_ANCHOR: XYPosition = { x: 360, y: 200 };

export interface Placement {
  position: XYPosition;
  /** The room the block was given. */
  size: Size;
  /** False when nothing on screen was free: the block is beside what is, and the view has to move to show it. */
  visible: boolean;
}

/** A block's box in flow coordinates: as React Flow measured it, or as assumed before it has. */
export function boxOf(node: SdNode): Box {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? NODE_FOOTPRINT.width,
    height: node.measured?.height ?? NODE_FOOTPRINT.height,
  };
}

/** Two boxes closer than the gap: a block placed there would sit on the other's handles. */
function crowds(a: Box, b: Box): boolean {
  return overlaps(grown(a, NODE_GAP), b);
}

/** The room a new block is given: the largest any block on the canvas takes, never less than assumed. */
function footprint(nodes: readonly SdNode[]): Size {
  return nodes.reduce<Size>(
    (size, node) => ({
      width: Math.max(size.width, node.measured?.width ?? 0),
      height: Math.max(size.height, node.measured?.height ?? 0),
    }),
    NODE_FOOTPRINT,
  );
}

/**
 * The free corner nearest `origin` for a block of `size` — inside `within`
 * when one is given, anywhere otherwise. Null when `within` has no room.
 *
 * The nearest free place is `origin` itself, or it touches what is in the
 * way: it sits one gap off a block's edge (or on the area's own edge) on one
 * axis or both. So those edges, crossed, are every candidate there is — no
 * grid to fall between, and no search radius to run out of. Ties go below,
 * then right: a column grows downward from where the author looks.
 */
function nearestFree(
  origin: XYPosition,
  size: Size,
  taken: readonly Box[],
  within: Box | null,
): XYPosition | null {
  // Only a block within a gap of the area can crowd a place inside it.
  const near = within === null ? taken : taken.filter((box) => crowds(within, box));
  const xs = new Set([origin.x]);
  const ys = new Set([origin.y]);
  for (const box of near) {
    xs.add(box.x + box.width + NODE_GAP).add(box.x - NODE_GAP - size.width);
    ys.add(box.y + box.height + NODE_GAP).add(box.y - NODE_GAP - size.height);
  }
  if (within !== null) {
    xs.add(within.x).add(within.x + within.width - size.width);
    ys.add(within.y).add(within.y + within.height - size.height);
  }

  let best: XYPosition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const x of xs) {
    for (const y of ys) {
      const distance = Math.hypot(x - origin.x, y - origin.y);
      const nearer =
        best === null ||
        distance < bestDistance ||
        (distance === bestDistance && (y > best.y || (y === best.y && x > best.x)));
      if (!nearer) continue;
      const slot = { x, y, ...size };
      if (within !== null && !contains(within, slot)) continue;
      if (near.some((box) => crowds(slot, box))) continue;
      best = { x, y };
      bestDistance = distance;
    }
  }
  return best;
}

const centredOn = (point: XYPosition, size: Size): XYPosition => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
});

const centreOf = (box: Box): XYPosition => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/**
 * Where a block goes when the author did not say. `visible` is the part of
 * the canvas they can see in full (null when no canvas is on screen): the
 * block takes the free place nearest its middle, a gap clear of every other
 * block. When nothing visible is free it takes the nearest free place
 * anywhere and says so — the caller moves the view to show it.
 */
export function placeBlock(nodes: readonly SdNode[], visible: Box | null): Placement {
  const size = footprint(nodes);
  const taken = nodes.map(boxOf);
  const origin = centredOn(visible === null ? FALLBACK_ANCHOR : centreOf(visible), size);
  const onScreen = visible === null ? null : nearestFree(origin, size, taken, visible);
  if (onScreen !== null) return { position: onScreen, size, visible: true };
  // Unbounded, there is always room: at the least, one gap past the outermost block.
  const anywhere = nearestFree(origin, size, taken, null) ?? origin;
  return { position: anywhere, size, visible: visible === null };
}

/**
 * Where a dropped block goes: where the pointer let go of it, pulled back
 * only as far as keeps a block's least footprint on the pane — a drop at the
 * very edge is still a block the author can see and grab.
 */
export function dropPosition(pointer: XYPosition, pane: Box | null): XYPosition {
  if (pane === null) return pointer;
  const shift = revealShift({ ...pointer, ...NODE_MIN_FOOTPRINT }, pane);
  return { x: pointer.x - shift.x, y: pointer.y - shift.y };
}
