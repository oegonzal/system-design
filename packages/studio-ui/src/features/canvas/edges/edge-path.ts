import { Position, type XYPosition } from '@xyflow/react';

import { centredOn, grown, overlaps, type Box, type Size } from '../geometry';

/**
 * The line a connection is drawn along, and where its pill sits on it. The
 * edge owns its curve — the same Bézier React Flow draws by default — so the
 * pill can be put anywhere along the very line that is drawn rather than
 * only at the one midpoint the library hands back. Pure geometry: lines and
 * blocks in, places out.
 */

/** A cubic Bézier in flow coordinates. */
export interface Curve {
  from: XYPosition;
  fromControl: XYPosition;
  toControl: XYPosition;
  to: XYPosition;
}

export interface ConnectionEnds {
  source: XYPosition;
  sourceSide: Position;
  target: XYPosition;
  targetSide: Position;
}

/** How hard the line bends when its far end lies behind the handle it leaves from. */
const CURVATURE = 0.25;

/** How far a control point is pushed out of its handle, given how far ahead of it the other end is. */
function controlOffset(ahead: number): number {
  return ahead >= 0 ? 0.5 * ahead : CURVATURE * 25 * Math.sqrt(-ahead);
}

/** The control point for the end at `from`, leaving through `side` toward `to`. */
function controlPoint(side: Position, from: XYPosition, to: XYPosition): XYPosition {
  switch (side) {
    case Position.Left:
      return { x: from.x - controlOffset(from.x - to.x), y: from.y };
    case Position.Right:
      return { x: from.x + controlOffset(to.x - from.x), y: from.y };
    case Position.Top:
      return { x: from.x, y: from.y - controlOffset(from.y - to.y) };
    case Position.Bottom:
      return { x: from.x, y: from.y + controlOffset(to.y - from.y) };
  }
}

/** The curve between two handles: out of each through its side, as React Flow's default edge bends. */
export function connectionCurve({ source, sourceSide, target, targetSide }: ConnectionEnds): Curve {
  return {
    from: source,
    fromControl: controlPoint(sourceSide, source, target),
    toControl: controlPoint(targetSide, target, source),
    to: target,
  };
}

/** The curve as an SVG path. */
export function curvePath({ from, fromControl, toControl, to }: Curve): string {
  return `M${from.x},${from.y} C${fromControl.x},${fromControl.y} ${toControl.x},${toControl.y} ${to.x},${to.y}`;
}

/** The point a fraction `t` of the way along the curve's parameter: 0 the source, 1 the target. */
export function pointAt({ from, fromControl, toControl, to }: Curve, t: number): XYPosition {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * fromControl.x + c * toControl.x + d * to.x,
    y: a * from.y + b * fromControl.y + c * toControl.y + d * to.y,
  };
}

const distance = (a: XYPosition, b: XYPosition): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * How many equal steps of `t` cover the curve without any one step moving
 * the pill further than half its shorter side — so a walk along the line
 * cannot step over a gap the pill fits in. A cubic never moves faster than
 * three times its longest control leg.
 */
function stepsAlong({ from, fromControl, toControl, to }: Curve, pill: Size): number {
  const longestLeg = Math.max(
    distance(from, fromControl),
    distance(fromControl, toControl),
    distance(toControl, to),
  );
  const stride = Math.min(pill.width, pill.height) / 2;
  return Math.max(Math.ceil((3 * longestLeg) / stride), 1);
}

/** Where a connection's pill is asked to sit: on its line, at its laid-out size (null until it has one). */
export interface PillAsk {
  id: string;
  curve: Curve;
  size: Size | null;
}

/** The clear space kept between two pills, so neighbours read as two labels rather than one. */
export const PILL_GAP = 4;

/** Whether the pill has been laid out yet: a pill with no size has no place to keep clear. */
const laidOut = (size: Size | null): size is Size =>
  size !== null && size.width > 0 && size.height > 0;

/** How much of `a` lies under `b`, as an area; 0 when they do not overlap. */
function sharedArea(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** The places a pill can take along its line, nearest the middle first, the source's side before the target's at each step. */
function* placesAlong(curve: Curve, pill: Size): Generator<XYPosition> {
  yield pointAt(curve, 0.5);
  const steps = stepsAlong(curve, pill);
  for (let step = 1; step * 2 <= steps; step += 1) {
    yield pointAt(curve, 0.5 - step / steps);
    yield pointAt(curve, 0.5 + step / steps);
  }
}

/**
 * Where one pill goes on its line, given the blocks and the pills already
 * placed: the place nearest the middle that is clear of both. Where none
 * is, the place clear of every block that the placed pills cover least —
 * so a crowded label is overlapped as little as the line allows, never
 * hidden when it need not be. In the middle when it has no size yet, or
 * when no place on the line is clear of the blocks (two blocks too close for
 * a pill to fit between).
 */
function placeOne(
  curve: Curve,
  pill: Size | null,
  blocks: readonly Box[],
  placed: readonly Box[],
): XYPosition {
  const middle = pointAt(curve, 0.5);
  if (!laidOut(pill)) return middle;
  let fallback: { place: XYPosition; covered: number } | null = null;
  for (const place of placesAlong(curve, pill)) {
    const box = centredOn(place, pill);
    if (blocks.some((block) => overlaps(box, block))) continue;
    const spaced = grown(box, PILL_GAP);
    const covered = placed.reduce((sum, other) => sum + sharedArea(spaced, other), 0);
    if (covered === 0) return place;
    if (fallback === null || covered < fallback.covered) fallback = { place, covered };
  }
  return fallback?.place ?? middle;
}

/**
 * Where every pill on a canvas is centred, decided together so that no two
 * land on each other: each in turn, in the order asked — the canvas asks in
 * its connections' order, so an older connection keeps its place and a new
 * one finds room around it — takes the place on its line nearest the middle
 * that is clear of every block and of every pill placed before it.
 * Deterministic: the same lines, sizes and blocks always give the same
 * places, on the screen and in the PDF that copies it.
 */
export function placePills(
  asks: readonly PillAsk[],
  blocks: readonly Box[],
): Map<string, XYPosition> {
  const places = new Map<string, XYPosition>();
  const placed: Box[] = [];
  for (const { id, curve, size } of asks) {
    const place = placeOne(curve, size, blocks, placed);
    places.set(id, place);
    if (laidOut(size)) placed.push(centredOn(place, size));
  }
  return places;
}
