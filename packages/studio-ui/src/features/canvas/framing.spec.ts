import { describe, expect, it } from 'vitest';

import { PANEL_BAND, revealShift, viewArea } from './framing';

describe('viewArea', () => {
  it('is null while the pane has no size', () => {
    expect(viewArea({ width: 0, height: 600 }, [0, 0, 1])).toBeNull();
  });

  it('is the pane in flow coordinates, and the part of it the panels do not float over', () => {
    expect(viewArea({ width: 800, height: 600 }, [0, 0, 1])).toEqual({
      pane: { x: 0, y: 0, width: 800, height: 600 },
      clear: { x: 0, y: 0, width: 800, height: 600 - PANEL_BAND },
    });
  });

  it('follows the pan and the zoom', () => {
    // Panned 100 right and 50 down, at 200%: half as much canvas, starting left of and above the origin.
    expect(viewArea({ width: 800, height: 600 }, [100, 50, 2])).toEqual({
      pane: { x: -50, y: -25, width: 400, height: 300 },
      clear: { x: -50, y: -25, width: 400, height: (600 - PANEL_BAND) / 2 },
    });
  });

  it('has no clear part when the pane is no taller than the panels’ band', () => {
    expect(viewArea({ width: 800, height: PANEL_BAND - 1 }, [0, 0, 1])?.clear.height).toBe(0);
  });
});

describe('revealShift', () => {
  const area = { x: 0, y: 0, width: 800, height: 500 };

  it('is nothing for a box already in view', () => {
    expect(revealShift({ x: 100, y: 100, width: 220, height: 56 }, area)).toEqual({ x: 0, y: 0 });
  });

  it('is the overhang, per axis, for a box past an edge — the least move that shows it', () => {
    expect(revealShift({ x: 700, y: 100, width: 220, height: 56 }, area)).toEqual({ x: 120, y: 0 });
    expect(revealShift({ x: -30, y: 480, width: 220, height: 56 }, area)).toEqual({
      x: -30,
      y: 36,
    });
  });

  it('centres a box too large for the area', () => {
    expect(revealShift({ x: 0, y: 100, width: 1000, height: 56 }, area)).toEqual({ x: 100, y: 0 });
  });
});
