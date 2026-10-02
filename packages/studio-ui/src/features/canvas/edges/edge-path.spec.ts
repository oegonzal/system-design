import { getBezierPath, Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { overlaps, type Box, type Size } from '../geometry';
import { connectionCurve, curvePath, pillPoint, pointAt, type ConnectionEnds } from './edge-path';

const pill: Size = { width: 60, height: 20 };

const pillBox = (point: { x: number; y: number }): Box => ({
  x: point.x - pill.width / 2,
  y: point.y - pill.height / 2,
  ...pill,
});

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

describe('pillPoint', () => {
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
  });
});
