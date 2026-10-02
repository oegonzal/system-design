import type { Transform, Viewport, XYPosition } from '@xyflow/react';

import { contains, type Box, type Size } from './geometry';

/**
 * How the canvas frames what it shows, declared once: what a fit leaves
 * clear and the view it frames the diagram by, which part of the pane the
 * author can actually see, and how far the view has to move to show a box. Pure, so the store's placement and a spec
 * read the same numbers the canvas draws by.
 */

/** The minimap's size — drawn at this, and kept clear by every fit. */
export const MINIMAP_SIZE: Size = { width: 140, height: 96 };
/** The margin React Flow's stylesheet puts around each panel (`.react-flow__panel`). */
export const PANEL_MARGIN = 15;
/** Room between a framed diagram and the frame's edge. */
export const FIT_MARGIN = 24;
/** The band along the pane's bottom edge that the minimap and the zoom controls float over. */
export const PANEL_BAND = MINIMAP_SIZE.height + PANEL_MARGIN;

/**
 * The zoom every fit frames within. Never past 100%, so a lone block is not
 * blown up to fill the frame; and never below the canvas's own floor — the
 * least zoom the author can reach, which the canvas is given from here too.
 */
export const FIT_ZOOM = { min: 0.5, max: 1 } as const;

/**
 * What every fit — on load, from the toolbar, from the zoom controls —
 * leaves clear around the diagram, in screen pixels: a margin on every
 * side, and along the bottom the band the minimap and the zoom controls sit
 * in, so no block lands under them.
 */
export const FIT_PADDING = {
  top: FIT_MARGIN,
  right: FIT_MARGIN,
  bottom: PANEL_BAND + FIT_MARGIN,
  left: FIT_MARGIN,
} as const;

/** The smallest box holding every one of `boxes` (at least one). */
function boundsOf(boxes: readonly [Box, ...Box[]]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Reading order: the higher block first, and of two at one height the one further left. */
const inReadingOrder = (a: Box, b: Box): number => a.y - b.y || a.x - b.x;

/**
 * What a window of `size` shows of a diagram too large for it, opened where
 * the diagram is read from: the window holds the first block in reading
 * order — the topmost, then leftmost — so the top of the design is on
 * screen and the pane is never blank, and of the windows that do, the one
 * holding the most blocks wholly, the leftmost of equals. The first block
 * is the topmost, so the window's top is its top; a best window slid right
 * until its left edge meets a block it holds loses none, so every block's
 * left edge that keeps the first block inside is every window there is. The
 * first block alone when even it is larger than the window.
 */
function heldFromTheTop(size: Size, blocks: readonly [Box, ...Box[]]): [Box, ...Box[]] {
  const first = blocks.reduce((earliest, block) =>
    inReadingOrder(block, earliest) < 0 ? block : earliest,
  );
  const lefts = [...new Set(blocks.map((block) => block.x))].sort((a, b) => a - b);
  let best: [Box, ...Box[]] = [first];
  for (const x of lefts) {
    const window = { x, y: first.y, ...size };
    if (!contains(window, first)) continue;
    const others = blocks.filter((block) => block !== first && contains(window, block));
    if (others.length + 1 > best.length) best = [first, ...others];
  }
  return best;
}

/**
 * Where a span `length` screen pixels long starts in a pane `size` long that
 * keeps `before` and `after` clear: centred in the pane and pushed off a
 * margin it would cross — or, when it is longer than the room between them,
 * from the leading margin, so its start (the diagram's top, its left) is on
 * screen rather than both ends cut.
 */
function spanStart(length: number, size: number, before: number, after: number): number {
  if (length > size - before - after) return before;
  return Math.min(Math.max((size - length) / 2, before), size - after - length);
}

/**
 * The view that frames the measured blocks in a pane of `size`: the whole
 * diagram, as large as fits up to 100%, clear of `FIT_PADDING`. A diagram
 * that would need less than the zoom floor is framed at the floor from
 * where it is read (`heldFromTheTop`): its top on screen with as many blocks
 * as the frame holds beside and below it — never the empty middle between
 * distant blocks — and what cannot fit runs off the sides and the bottom,
 * never the top. Null when there is nothing to frame or nowhere to frame it.
 */
export function frameFor(blocks: readonly Box[], size: Size): Viewport | null {
  const [first, ...rest] = blocks;
  if (first === undefined || size.width <= 0 || size.height <= 0) return null;
  const all = boundsOf([first, ...rest]);
  const room = {
    width: size.width - FIT_PADDING.left - FIT_PADDING.right,
    height: size.height - FIT_PADDING.top - FIT_PADDING.bottom,
  };
  const fitting = Math.min(room.width / all.width, room.height / all.height);
  const zoom = Math.min(Math.max(fitting, FIT_ZOOM.min), FIT_ZOOM.max);
  const framed =
    fitting >= FIT_ZOOM.min
      ? all
      : boundsOf(
          heldFromTheTop({ width: room.width / zoom, height: room.height / zoom }, [
            first,
            ...rest,
          ]),
        );
  return {
    x:
      spanStart(framed.width * zoom, size.width, FIT_PADDING.left, FIT_PADDING.right) -
      framed.x * zoom,
    y:
      spanStart(framed.height * zoom, size.height, FIT_PADDING.top, FIT_PADDING.bottom) -
      framed.y * zoom,
    zoom,
  };
}

/** What is on screen, in flow coordinates. */
export interface ViewArea {
  /** The whole pane. */
  pane: Box;
  /** The pane without the band the panels float over: where a block is seen in full. */
  clear: Box;
}

/** The part of the flow a pane of this size shows under this pan and zoom; null while it has no size. */
export function viewArea(size: Size, [x, y, zoom]: Transform): ViewArea | null {
  if (size.width <= 0 || size.height <= 0) return null;
  // `0 - x`, not `-x`: an unpanned view starts at 0, never at -0.
  const pane = {
    x: (0 - x) / zoom,
    y: (0 - y) / zoom,
    width: size.width / zoom,
    height: size.height / zoom,
  };
  return { pane, clear: { ...pane, height: Math.max(size.height - PANEL_BAND, 0) / zoom } };
}

/** One axis of `revealShift`: nothing when the span is inside, the overhang when it is not, the centres' distance when it cannot fit. */
function axisShift(start: number, length: number, areaStart: number, areaLength: number): number {
  if (length > areaLength) return start + length / 2 - (areaStart + areaLength / 2);
  if (start < areaStart) return start - areaStart;
  const overhang = start + length - (areaStart + areaLength);
  return overhang > 0 ? overhang : 0;
}

/**
 * How far the view must move, in flow units, for `box` to be inside `area` —
 * the least distance that does it, so the author's place on the canvas is
 * kept. A box larger than the area is centred in it.
 */
export function revealShift(box: Box, area: Box): XYPosition {
  return {
    x: axisShift(box.x, box.width, area.x, area.width),
    y: axisShift(box.y, box.height, area.y, area.height),
  };
}
