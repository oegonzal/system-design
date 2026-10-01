import { describe, expect, it } from 'vitest';

import { NODE_ASSUMED_HEIGHT, NODE_GAP, NODE_WIDTH } from './geometry';
import { freeSlotNear } from './placement';
import type { SdNode } from './types';

function block(id: string, x: number, y: number, measured?: { width: number; height: number }) {
  return {
    id,
    type: 'sd',
    position: { x, y },
    ...(measured ? { measured } : {}),
    data: { kind: 'service', label: id },
  } satisfies SdNode;
}

const anchor = { x: 500, y: 300 };
const centred = { x: anchor.x - NODE_WIDTH.max / 2, y: anchor.y - NODE_ASSUMED_HEIGHT / 2 };

describe('freeSlotNear', () => {
  it('[UX-2] centres the block on the anchor when nothing is in the way', () => {
    expect(freeSlotNear(anchor, [])).toEqual(centred);
  });

  it('[UX-2] takes the nearest slot no block crowds — below first, a whole block plus the gap away', () => {
    const slot = freeSlotNear(anchor, [block('n-1', centred.x, centred.y)]);

    expect(slot).toEqual({ x: centred.x, y: centred.y + NODE_ASSUMED_HEIGHT + NODE_GAP });
  });

  it('reads measured sizes, so a tall block pushes the next one clear of it', () => {
    const tall = block('n-1', centred.x, centred.y, { width: NODE_WIDTH.max, height: 200 });

    const slot = freeSlotNear(anchor, [tall]);

    // Slots are now a 200-tall block apart, so the nearest clear one is beside it.
    expect(slot).toEqual({
      x: anchor.x - NODE_WIDTH.max / 2 + NODE_WIDTH.max + NODE_GAP,
      y: anchor.y - 100,
    });
  });

  it('falls back to the anchor itself when every searched slot is taken', () => {
    // Blocks every 200 × 50 px from far above-left to far below-right of the anchor.
    const wall = Array.from({ length: 50 }, (_, row) =>
      Array.from({ length: 20 }, (__, col) =>
        block(`n-${row}-${col}`, -1500 + col * 200, -1000 + row * 50),
      ),
    ).flat();

    expect(freeSlotNear(anchor, wall)).toEqual(centred);
  });
});
