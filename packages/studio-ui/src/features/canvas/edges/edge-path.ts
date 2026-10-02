import { Position, type XYPosition } from '@xyflow/react';

import { overlaps, type Box, type Size } from '../geometry';

/**
 * The line a connection is drawn along, and where its pill sits on it. The
 * edge owns its curve — the same Bézier React Flow draws by default — so the
 * pill can be put anywhere along the very line that is drawn rather than
 * only at the one midpoint the library hands back. Pure geometry: blocks in,
 * a point out.
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

const centredOn = (point: XYPosition, size: Size): Box => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
  ...size,
});

/**
 * Where a connection's pill is centred: the middle of the line, or — when a
 * block is under the pill there — the nearest point along the line where the
 * pill is clear of every block, looking toward the source first. It stays in
 * the middle when it has no size yet, or when no point on the line is clear
 * (two blocks too close for a pill to fit between).
 */
export function pillPoint(curve: Curve, pill: Size, blocks: readonly Box[]): XYPosition {
  const middle = pointAt(curve, 0.5);
  if (pill.width <= 0 || pill.height <= 0) return middle;
  const clearAt = (point: XYPosition): boolean => {
    const box = centredOn(point, pill);
    return !blocks.some((block) => overlaps(box, block));
  };
  if (clearAt(middle)) return middle;

  const steps = stepsAlong(curve, pill);
  for (let step = 1; step * 2 <= steps; step += 1) {
    for (const t of [0.5 - step / steps, 0.5 + step / steps]) {
      const point = pointAt(curve, t);
      if (clearAt(point)) return point;
    }
  }
  return middle;
}
