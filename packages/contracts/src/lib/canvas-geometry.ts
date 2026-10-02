import type { CanvasPosition } from './canvas-layout';

/**
 * The geometry a canvas is laid out by, declared once: a size, a box, the
 * three questions asked of boxes, and the one search for a free place that
 * every placement runs — the API laying out a coach's revision and the
 * studio placing a block the author added — so no two placers can disagree
 * about what "free" means.
 */

export interface CanvasSize {
  width: number;
  height: number;
}

/** A rectangle in flow coordinates: a block, a pill, the part of the canvas on screen. */
export interface CanvasBox extends CanvasSize {
  x: number;
  y: number;
}

/** Whether the two boxes share any area; touching edges do not count. */
export function boxesOverlap(a: CanvasBox, b: CanvasBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether `inner` lies wholly inside `outer`. */
export function boxContains(outer: CanvasBox, inner: CanvasBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** `box` grown by `margin` on every side. */
export function grownBox(box: CanvasBox, margin: number): CanvasBox {
  return {
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2,
  };
}

/** The box of `size` whose middle is `point`. */
export const centredOn = (point: CanvasPosition, size: CanvasSize): CanvasBox => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
  ...size,
});

/** How far apart two places count when the nearest is chosen: a straight line, unless the caller measures otherwise. */
export type PlaceDistance = (dx: number, dy: number) => number;

export const straightLine: PlaceDistance = (dx, dy) => Math.hypot(dx, dy);

export interface FreePlaceAsk {
  /** Where the block would go if nothing were in the way: its top-left corner. */
  origin: CanvasPosition;
  /** The room the block is given. */
  size: CanvasSize;
  /** Every box already placed. */
  taken: readonly CanvasBox[];
  /** The clear space kept between the block and any taken box: a place closer than this crowds it. */
  gap: number;
  /** The area the place must lie wholly inside; anywhere when absent. */
  within?: CanvasBox | null;
  /** How distance from `origin` is measured; a straight line unless said. */
  distance?: PlaceDistance;
}

/**
 * The free corner nearest `origin` for a block of `size` — inside `within`
 * when one is given, anywhere otherwise. Null only when `within` has no
 * room; unbounded, there is always a place at the least one gap past the
 * outermost box.
 *
 * The nearest free place is `origin` itself, or it touches what is in the
 * way: it sits one gap off a taken box's edge (or on the area's own edge) on
 * one axis or both. So those edges, crossed, are every candidate there is —
 * no grid to fall between, and no search radius to run out of. Ties go
 * below, then right: a column grows downward from where its neighbours are.
 */
export function nearestFreePlace({
  origin,
  size,
  taken,
  gap,
  within = null,
  distance = straightLine,
}: FreePlaceAsk): CanvasPosition | null {
  const crowds = (a: CanvasBox, b: CanvasBox): boolean => boxesOverlap(grownBox(a, gap), b);
  // Only a box within a gap of the area can crowd a place inside it.
  const near = within === null ? taken : taken.filter((box) => crowds(within, box));
  const xs = new Set([origin.x]);
  const ys = new Set([origin.y]);
  for (const box of near) {
    xs.add(box.x + box.width + gap).add(box.x - gap - size.width);
    ys.add(box.y + box.height + gap).add(box.y - gap - size.height);
  }
  if (within !== null) {
    xs.add(within.x).add(within.x + within.width - size.width);
    ys.add(within.y).add(within.y + within.height - size.height);
  }

  let best: CanvasPosition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const x of xs) {
    for (const y of ys) {
      const apart = distance(x - origin.x, y - origin.y);
      const nearer =
        best === null ||
        apart < bestDistance ||
        (apart === bestDistance && (y > best.y || (y === best.y && x > best.x)));
      if (!nearer) continue;
      const place = { x, y, ...size };
      if (within !== null && !boxContains(within, place)) continue;
      if (near.some((box) => crowds(place, box))) continue;
      best = { x, y };
      bestDistance = apart;
    }
  }
  return best;
}
