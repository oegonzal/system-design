import { nearestFreePlace } from '@sysdesign/contracts';
import type { XYPosition } from '@xyflow/react';

import { revealShift } from './framing';
import {
  centredOn,
  NODE_FOOTPRINT,
  NODE_GAP,
  NODE_MIN_FOOTPRINT,
  type Box,
  type Size,
} from './geometry';
import type { SdNode } from './types';

/**
 * Where a block goes. When the author did not say: the free place nearest
 * the middle of what they can see, and beside it only when nothing they can
 * see is free — found by the contract's one free-place search, the same one
 * that lays out a coach's revision. When they did (a drop): where they let
 * go of it. Pure, so the store can apply it to every add and a spec can pin
 * it down without a browser.
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
  const { x, y } = centredOn(visible === null ? FALLBACK_ANCHOR : centreOf(visible), size);
  const ask = { origin: { x, y }, size, taken, gap: NODE_GAP };
  const onScreen = visible === null ? null : nearestFreePlace({ ...ask, within: visible });
  if (onScreen !== null) return { position: onScreen, size, visible: true };
  // Unbounded, there is always room: at the least, one gap past the outermost block.
  const anywhere = nearestFreePlace(ask) ?? ask.origin;
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
