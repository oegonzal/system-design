import { describe, expect, it } from 'vitest';

import {
  domainOf,
  layoutColumns,
  MAX_COLUMN_WIDTH,
  slotBoxes,
  SURFACE_GAP,
  type ColumnDatum,
} from './geometry';

const SERIES = ['a', 'b'];
const DATA: ColumnDatum[] = [
  { label: 'Oct', values: { a: 30, b: 20 } },
  { label: 'Nov', values: { a: -10, b: 20 } },
  { label: 'Dec', values: { a: { value: 10, band: { low: 5, high: 60 } } } },
];

describe('column geometry', () => {
  it('sums a stacked domain by sign, takes grouped extremes, and always holds zero and the bands', () => {
    expect(domainOf(DATA, SERIES, 'stacked')).toEqual({ min: -10, max: 60 });
    expect(domainOf(DATA, SERIES, 'grouped')).toEqual({ min: -10, max: 60 });
    expect(domainOf([{ label: 'x', values: { a: 5 } }], SERIES, 'grouped')).toEqual({
      min: 0,
      max: 5,
    });
  });

  it('stacks positives up and negatives down from zero with a surface gap, keeps marks thin, and skips a missing series', () => {
    const plot = { width: 300, height: 100, domain: { min: -10, max: 60 } };
    const { columns, bands } = layoutColumns(DATA, SERIES, 'stacked', plot);
    const zero = 100 - (10 / 70) * 100;
    const [octA, octB, novA, novB, decA] = columns;
    expect(columns).toHaveLength(5);
    expect(octA).toMatchObject({ seriesIndex: 0, datumIndex: 0, negative: false });
    expect(octA?.y).toBeCloseTo(zero - (30 / 70) * 100, 6);
    expect(octB?.y).toBeCloseTo(zero - (50 / 70) * 100, 6);
    expect((octB?.y ?? 0) + (octB?.height ?? 0)).toBeCloseTo((octA?.y ?? 0) - SURFACE_GAP, 6);
    expect(novA).toMatchObject({ negative: true });
    expect(novA?.y).toBeCloseTo(zero, 6);
    expect(novB?.negative).toBe(false);
    expect(decA?.cell.band).toEqual({ low: 5, high: 60 });
    expect(bands).toHaveLength(1);
    expect(bands[0]?.y).toBeCloseTo(0, 6);
    expect(columns.every((column) => column.width <= MAX_COLUMN_WIDTH)).toBe(true);
  });

  it('places grouped columns side by side inside the slot, each at most the maximum width', () => {
    const plot = { width: 120, height: 100, domain: { min: 0, max: 60 } };
    const { columns } = layoutColumns(DATA.slice(0, 1), SERIES, 'grouped', plot);
    expect(columns).toHaveLength(2);
    const [a, b] = columns;
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeCloseTo((a?.width ?? 0) + SURFACE_GAP, 6);
    expect(a?.width).toBeLessThanOrEqual(MAX_COLUMN_WIDTH);
    expect(layoutColumns([], SERIES, 'grouped', plot)).toEqual({ columns: [], bands: [] });
  });

  it('cuts the plot into one hit box per datum as fractions of the frame, bubbles flipping past the midpoint, and none for no data', () => {
    const frame = { width: 960, height: 266, plot: { left: 60, top: 18, width: 888, height: 220 } };
    const boxes = slotBoxes(3, frame);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toEqual({
      left: 60 / 960,
      width: 296 / 960,
      top: 18 / 266,
      height: 220 / 266,
      after: true,
    });
    expect(boxes[1]?.after).toBe(true);
    expect(boxes[2]).toMatchObject({ left: 652 / 960, after: false });
    expect((boxes[2]?.left ?? 0) + (boxes[2]?.width ?? 0)).toBeCloseTo(948 / 960, 9);
    expect(slotBoxes(0, frame)).toEqual([]);
  });
});
