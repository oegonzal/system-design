import { getBezierPath, Position, type XYPosition } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { grown, overlaps, type Box, type Size } from '../geometry';
import {
  connectionCurve,
  curvePath,
  PILL_GAP,
  placePills,
  pointAt,
  type ConnectionEnds,
  type Curve,
  type PillAsk,
} from './edge-path';

const pill: Size = { width: 60, height: 20 };

const pillBox = (point: { x: number; y: number }, size: Size = pill): Box => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
  ...size,
});

/** One pill placed alone among the blocks: the place `placePills` gives the only pill it is asked for. */
function pillPoint(curve: Curve, size: Size | null, blocks: readonly Box[]) {
  const place = placePills([{ id: 'only', curve, size }], blocks).get('only');
  if (place === undefined) throw new Error('the pill was not placed');
  return place;
}

/** A block's bottom handle to another's top handle, straight down. */
const down: ConnectionEnds = {
  source: { x: 200, y: 71 },
  sourceSide: Position.Bottom,
  target: { x: 200, y: 340 },
  targetSide: Position.Top,
};

describe('connectionCurve', () => {
  it.each([
    ['downward', down],
    [
      'upward, around the blocks',
      { ...down, source: { x: 120, y: 400 }, target: { x: 480, y: 60 } },
    ],
    [
      'sideways',
      {
        source: { x: 100, y: 100 },
        sourceSide: Position.Right,
        target: { x: 420, y: 260 },
        targetSide: Position.Left,
      },
    ],
  ] satisfies [string, ConnectionEnds][])(
    'draws the line React Flow’s default edge draws, %s, and has its midpoint where the library puts a label',
    (_name, ends) => {
      const [path, labelX, labelY] = getBezierPath({
        sourceX: ends.source.x,
        sourceY: ends.source.y,
        sourcePosition: ends.sourceSide,
        targetX: ends.target.x,
        targetY: ends.target.y,
        targetPosition: ends.targetSide,
      });
      const curve = connectionCurve(ends);

      expect(curvePath(curve)).toBe(path);
      expect(pointAt(curve, 0.5).x).toBeCloseTo(labelX);
      expect(pointAt(curve, 0.5).y).toBeCloseTo(labelY);
      expect(pointAt(curve, 0)).toEqual(ends.source);
      expect(pointAt(curve, 1)).toEqual(ends.target);
    },
  );
});

describe('placePills — one pill among the blocks', () => {
  const curve = connectionCurve(down);
  const sourceBlock: Box = { x: 134, y: 20, width: 132, height: 51 };
  const targetBlock: Box = { x: 134, y: 340, width: 132, height: 51 };

  it('is the middle of the line when no block is under the pill there', () => {
    expect(pillPoint(curve, pill, [sourceBlock, targetBlock])).toEqual(pointAt(curve, 0.5));
  });

  it('moves along the line, off a block the midpoint lands on, to the nearest point clear of every block', () => {
    // A third block sitting right across the middle of the connection.
    const between: Box = { x: 124, y: 180, width: 150, height: 51 };
    const blocks = [sourceBlock, between, targetBlock];
    expect(overlaps(pillBox(pointAt(curve, 0.5)), between)).toBe(true);

    const point = pillPoint(curve, pill, blocks);

    expect(blocks.some((block) => overlaps(pillBox(point), block))).toBe(false);
    // Still on the line — a straight drop here — and on the source's side of the block.
    expect(point.x).toBeCloseTo(200);
    expect(point.y).toBeGreaterThan(sourceBlock.y + sourceBlock.height);
    expect(point.y).toBeLessThan(between.y);
    // The nearest clear point, not just any: the pill ends within a step of the block's edge.
    expect(between.y - (point.y + pill.height / 2)).toBeLessThan(pill.height / 2);
  });

  it('takes the target’s side when the source’s has no room', () => {
    // The block in the way reaches up to the source: only below it is clear.
    const between: Box = { x: 124, y: 80, width: 150, height: 170 };

    const point = pillPoint(curve, pill, [sourceBlock, between, targetBlock]);

    expect(point.y - pill.height / 2).toBeGreaterThanOrEqual(between.y + between.height);
    expect(point.y + pill.height / 2).toBeLessThanOrEqual(targetBlock.y);
  });

  it('stays in the middle when nowhere on the line is clear, or before the pill has a size', () => {
    const wall: Box = { x: 0, y: 0, width: 400, height: 400 };

    expect(pillPoint(curve, pill, [wall])).toEqual(pointAt(curve, 0.5));
    expect(pillPoint(curve, { width: 0, height: 0 }, [wall])).toEqual(pointAt(curve, 0.5));
    expect(pillPoint(curve, null, [wall])).toEqual(pointAt(curve, 0.5));
  });
});

describe('placePills — pills among each other', () => {
  const sourceBlock: Box = { x: 134, y: 20, width: 132, height: 51 };
  const targetBlock: Box = { x: 134, y: 340, width: 132, height: 51 };
  const blocks = [sourceBlock, targetBlock];
  /** A second connection beside `down`, close enough that two pills at the same height collide. */
  const beside = connectionCurve({
    ...down,
    source: { x: 230, y: 71 },
    target: { x: 230, y: 340 },
  });
  const first = connectionCurve(down);
  const wide: Size = { width: 120, height: 20 };

  /** The two pills' boxes where `placePills` put them, in the order asked. */
  function placedBoxes(
    asks: readonly [PillAsk, PillAsk],
    places: Map<string, XYPosition>,
  ): [Box, Box] {
    const boxOf = ({ id, size }: PillAsk): Box => {
      const place = places.get(id);
      if (place === undefined || size === null) throw new Error(`${id} was not placed`);
      return pillBox(place, size);
    };
    return [boxOf(asks[0]), boxOf(asks[1])];
  }

  /** How much of `box` lies under `other`. */
  const coveredBy = (box: Box, other: Box): number =>
    Math.max(Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x), 0) *
    Math.max(Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y), 0);

  it('moves a pill whose middle an earlier pill covers along its own line, to the nearest place clear of that pill and every block', () => {
    const asks: [PillAsk, PillAsk] = [
      { id: 'e-1', curve: first, size: wide },
      { id: 'e-2', curve: beside, size: wide },
    ];
    // At their middles the two labels would sit on each other.
    expect(overlaps(pillBox(pointAt(first, 0.5), wide), pillBox(pointAt(beside, 0.5), wide))).toBe(
      true,
    );

    const places = placePills(asks, blocks);
    const [earlier, later] = placedBoxes(asks, places);

    // The first asked keeps the middle; the second leaves it, on its own line, with a gap between them.
    expect(places.get('e-1')).toEqual(pointAt(first, 0.5));
    expect(places.get('e-2')?.x).toBeCloseTo(230);
    expect(overlaps(grown(later, PILL_GAP), earlier)).toBe(false);
    expect(blocks.some((block) => overlaps(later, block))).toBe(false);
    // The nearest such place: within a step of the gap it has to keep.
    const apart = Math.max(
      earlier.y - (later.y + later.height),
      later.y - (earlier.y + earlier.height),
    );
    expect(apart).toBeGreaterThanOrEqual(PILL_GAP);
    expect(apart - PILL_GAP).toBeLessThan(wide.height / 2);
  });

  it('places in the order asked, so the connection asked first keeps its place and a later one finds room around it', () => {
    const forward = placePills(
      [
        { id: 'e-1', curve: first, size: wide },
        { id: 'e-2', curve: beside, size: wide },
      ],
      blocks,
    );
    const backward = placePills(
      [
        { id: 'e-2', curve: beside, size: wide },
        { id: 'e-1', curve: first, size: wide },
      ],
      blocks,
    );

    expect(forward.get('e-1')).toEqual(pointAt(first, 0.5));
    expect(backward.get('e-2')).toEqual(pointAt(beside, 0.5));
    expect(backward.get('e-1')).not.toEqual(pointAt(first, 0.5));
  });

  it('keeps a pill that has no size yet out of the question: it covers nothing until it is laid out', () => {
    const places = placePills(
      [
        { id: 'e-1', curve: first, size: null },
        { id: 'e-2', curve: beside, size: wide },
      ],
      blocks,
    );

    expect(places.get('e-1')).toEqual(pointAt(first, 0.5));
    expect(places.get('e-2')).toEqual(pointAt(beside, 0.5));
  });

  it('where no place on the line is clear of the pills, takes the one they cover least — still clear of every block', () => {
    // A short drop between two blocks, crossed at its middle by a tall pill on a sideways line.
    const top: Box = { x: 134, y: 20, width: 132, height: 51 };
    const bottom: Box = { x: 134, y: 140, width: 132, height: 51 };
    const short = connectionCurve({ ...down, target: { x: 200, y: 140 } });
    const across = connectionCurve({
      source: { x: 60, y: 105 },
      sourceSide: Position.Right,
      target: { x: 340, y: 105 },
      targetSide: Position.Left,
    });
    const tall: Size = { width: 60, height: 40 };
    const asks: [PillAsk, PillAsk] = [
      { id: 'across', curve: across, size: tall },
      { id: 'short', curve: short, size: pill },
    ];

    const places = placePills(asks, [top, bottom]);
    const [crossing, crowded] = placedBoxes(asks, places);

    expect([top, bottom].some((block) => overlaps(crowded, block))).toBe(false);
    // Crowded, but not hidden under the crossing pill where the middle would have put it.
    expect(coveredBy(crowded, crossing)).toBeGreaterThan(0);
    expect(coveredBy(crowded, crossing)).toBeLessThan(
      coveredBy(pillBox(pointAt(short, 0.5)), crossing) / 2,
    );
  });

  it('[UX-3] lane 0 is the default curve exactly; other lanes push both control points the same way, square to the line, and opposite lanes mirror', () => {
    const ends: ConnectionEnds = {
      source: { x: 0, y: 0 },
      sourceSide: Position.Bottom,
      target: { x: 0, y: 200 },
      targetSide: Position.Top,
    };
    const plain = connectionCurve(ends);
    expect(connectionCurve(ends, 0, 24)).toEqual(plain);
    const left = connectionCurve(ends, -0.5, 24);
    const right = connectionCurve(ends, 0.5, 24);
    expect(left.from).toEqual(plain.from);
    expect(left.to).toEqual(plain.to);
    expect(left.fromControl.x).toBeCloseTo(plain.fromControl.x + 12);
    expect(left.toControl.x).toBeCloseTo(plain.toControl.x + 12);
    expect(right.fromControl.x).toBeCloseTo(plain.fromControl.x - 12);
    expect(left.fromControl.y).toBeCloseTo(plain.fromControl.y);
  });
});
