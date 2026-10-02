import type { FitViewOptions, Transform, XYPosition } from '@xyflow/react';

import type { Box, Size } from './geometry';

/**
 * How the canvas frames what it shows, declared once: what a fit leaves
 * clear, which part of the pane the author can actually see, and how far the
 * view has to move to show a box. Pure, so the store's placement and a spec
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
 * How every fit frames the diagram — on load, from the toolbar, from the
 * zoom controls. Never past 100%, so a lone block is not blown up to fill
 * the frame; and the bottom band the minimap and the zoom controls sit in is
 * kept clear, so no block lands under them.
 */
export const FIT_VIEW_OPTIONS: FitViewOptions = {
  maxZoom: 1,
  padding: {
    top: `${FIT_MARGIN}px`,
    left: `${FIT_MARGIN}px`,
    right: `${FIT_MARGIN}px`,
    bottom: `${PANEL_BAND + FIT_MARGIN}px`,
  },
};

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
