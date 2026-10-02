import { describe, expect, it } from 'vitest';

import {
  boxContains,
  boxesOverlap,
  centredOn,
  grownBox,
  nearestFreePlace,
  type CanvasBox,
} from './canvas-geometry';

const SIZE = { width: 220, height: 56 };
const GAP = 24;

describe('canvas geometry', () => {
  it('asks the three box questions; touching edges neither overlap nor fail to contain', () => {
    const a: CanvasBox = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxesOverlap(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(boxesOverlap(a, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
    expect(boxContains(a, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(boxContains(a, { x: 1, y: 1, width: 10, height: 10 })).toBe(false);
    expect(grownBox(a, 2)).toEqual({ x: -2, y: -2, width: 14, height: 14 });
    expect(centredOn({ x: 100, y: 50 }, SIZE)).toEqual({ x: -10, y: 22, ...SIZE });
  });

  it('[UX-2] the nearest free place is the origin itself, or one gap off what is in the way — below first, then right', () => {
    const origin = { x: 300, y: 200 };
    expect(nearestFreePlace({ origin, size: SIZE, taken: [], gap: GAP })).toEqual(origin);
    const atOrigin: CanvasBox = { ...origin, ...SIZE };
    expect(nearestFreePlace({ origin, size: SIZE, taken: [atOrigin], gap: GAP })).toEqual({
      x: 300,
      y: 200 + SIZE.height + GAP,
    });
    // Two equal ways out: below wins over above, right over left.
    const tall = { ...SIZE, height: SIZE.width };
    expect(
      nearestFreePlace({ origin, size: tall, taken: [{ ...origin, ...tall }], gap: GAP }),
    ).toEqual({ x: 300, y: 200 + tall.height + GAP });
  });

  it('[UX-2] stays inside the area it is given, or says there is no room; unbounded, there is always room', () => {
    const within: CanvasBox = { x: 0, y: 0, width: 500, height: 300 };
    const taken: CanvasBox[] = [{ x: 0, y: 0, width: 500, height: 100 }];
    const origin = { x: 140, y: 122 };
    const place = nearestFreePlace({ origin, size: SIZE, taken, gap: GAP, within });
    expect(place).toEqual({ x: 140, y: 124 });
    const sliver: CanvasBox = { x: 0, y: 0, width: SIZE.width - 1, height: 300 };
    expect(
      nearestFreePlace({ origin, size: SIZE, taken: [], gap: GAP, within: sliver }),
    ).toBeNull();
    const wall = Array.from({ length: 20 }, (_, row) =>
      Array.from({ length: 10 }, (__, col) => ({
        x: -1000 + col * 240,
        y: -500 + row * 80,
        ...SIZE,
      })),
    ).flat();
    const out = nearestFreePlace({ origin, size: SIZE, taken: wall, gap: GAP });
    expect(out).not.toBeNull();
    expect(
      wall.some((box) => boxesOverlap(grownBox(box, GAP), { ...out, ...SIZE } as CanvasBox)),
    ).toBe(false);
  });

  it('measures distance the way the caller says, so a layout can count in slots', () => {
    const origin = { x: 0, y: 0 };
    const taken: CanvasBox[] = [{ ...origin, ...SIZE }];
    // Straight-line: below (80 away) beats beside (244 away).
    expect(nearestFreePlace({ origin, size: SIZE, taken, gap: GAP })).toEqual({ x: 0, y: 80 });
    // A row dearer than a column: beside wins.
    const rowsDear = (dx: number, dy: number) => Math.hypot(dx, dy * 10);
    expect(nearestFreePlace({ origin, size: SIZE, taken, gap: GAP, distance: rowsDear })).toEqual({
      x: 244,
      y: 0,
    });
  });
});
