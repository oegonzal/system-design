import type { Domain } from '../scale';

export interface ColumnSeries {
  id: string;
  label: string;
}

/** One value of one series at one x: the number, and how it is to be read. */
export interface ColumnCell {
  value: number;
  /** A forecast, not a measurement — drawn hatched. */
  projected?: boolean;
  /** Reported, but still growing — drawn lighter. */
  provisional?: boolean;
  /** A range the projection may fall in, drawn behind the column. */
  band?: { low: number; high: number };
}

export type ColumnValue = number | ColumnCell;

/** One x position: its label — unique within the chart, it keys the mark — and a value per series id; a series left out has no mark there. */
export interface ColumnDatum {
  label: string;
  values: Readonly<Record<string, ColumnValue>>;
}

export type ColumnLayout = 'stacked' | 'grouped';

export interface ColumnRect {
  x: number;
  y: number;
  width: number;
  height: number;
  seriesIndex: number;
  datumIndex: number;
  cell: ColumnCell;
  negative: boolean;
}

export interface BandRect {
  x: number;
  y: number;
  width: number;
  height: number;
  seriesIndex: number;
  datumIndex: number;
}

export interface PlotArea {
  width: number;
  height: number;
  domain: Domain;
}

/** The svg frame and where the plot sits inside it, in svg units. */
export interface PlotFrame {
  width: number;
  height: number;
  plot: { left: number; top: number; width: number; height: number };
}

/**
 * One datum's hit area as fractions of the frame — the whole slot across, the
 * whole plot down — so an HTML layer over the svg scales with it and nothing
 * is measured. `after` says a bubble sits past the slot (a datum in the left
 * half) or before it (the right half), so it never leaves the chart.
 */
export interface SlotBox {
  left: number;
  width: number;
  top: number;
  height: number;
  after: boolean;
}

export function slotBoxes(count: number, frame: PlotFrame): SlotBox[] {
  if (count === 0) return [];
  const slot = frame.plot.width / count;
  return Array.from({ length: count }, (_, index) => ({
    left: (frame.plot.left + slot * index) / frame.width,
    width: slot / frame.width,
    top: frame.plot.top / frame.height,
    height: frame.plot.height / frame.height,
    after: index * 2 < count,
  }));
}

/** Marks stay thin: never wider than this, whatever the plot width. */
export const MAX_COLUMN_WIDTH = 24;
/** The surface showing between adjacent fills — stacked segments, grouped neighbours. */
export const SURFACE_GAP = 2;

export const cellOf = (value: ColumnValue): ColumnCell =>
  typeof value === 'number' ? { value } : value;

/** The domain a layout needs: stacked sums positives and negatives apart; bands and zero are always inside. */
export function domainOf(
  data: readonly ColumnDatum[],
  seriesIds: readonly string[],
  layout: ColumnLayout,
): Domain {
  let min = 0;
  let max = 0;
  for (const datum of data) {
    let up = 0;
    let down = 0;
    for (const id of seriesIds) {
      const value = datum.values[id];
      if (value === undefined) continue;
      const cell = cellOf(value);
      if (layout === 'stacked') {
        if (cell.value >= 0) up += cell.value;
        else down += cell.value;
      } else {
        max = Math.max(max, cell.value);
        min = Math.min(min, cell.value);
      }
      if (cell.band) {
        max = Math.max(max, cell.band.high);
        min = Math.min(min, cell.band.low);
      }
    }
    max = Math.max(max, up);
    min = Math.min(min, down);
  }
  return { min, max };
}

const yOf = (plot: PlotArea) => {
  const span = plot.domain.max - plot.domain.min;
  return (value: number): number =>
    span === 0 ? plot.height : plot.height - ((value - plot.domain.min) / span) * plot.height;
};

/**
 * Where every column and band goes. A datum owns one slot of the plot width;
 * stacked columns share one thin bar (positives stack up from zero,
 * negatives down, a surface gap between segments) and grouped columns sit
 * side by side inside the slot, each at most `MAX_COLUMN_WIDTH` wide.
 */
export function layoutColumns(
  data: readonly ColumnDatum[],
  seriesIds: readonly string[],
  layout: ColumnLayout,
  plot: PlotArea,
): { columns: ColumnRect[]; bands: BandRect[] } {
  const columns: ColumnRect[] = [];
  const bands: BandRect[] = [];
  if (data.length === 0 || seriesIds.length === 0) return { columns, bands };
  const y = yOf(plot);
  const zero = y(0);
  const slot = plot.width / data.length;
  const perSeries = layout === 'grouped' ? seriesIds.length : 1;
  const thickness = Math.min(
    MAX_COLUMN_WIDTH,
    (slot * 0.7 - SURFACE_GAP * (perSeries - 1)) / perSeries,
  );
  const groupWidth = thickness * perSeries + SURFACE_GAP * (perSeries - 1);

  data.forEach((datum, datumIndex) => {
    const groupLeft = slot * datumIndex + (slot - groupWidth) / 2;
    let up = 0;
    let down = 0;
    seriesIds.forEach((id, seriesIndex) => {
      const value = datum.values[id];
      if (value === undefined) return;
      const cell = cellOf(value);
      const x =
        layout === 'grouped' ? groupLeft + seriesIndex * (thickness + SURFACE_GAP) : groupLeft;
      const negative = cell.value < 0;
      let top: number;
      let bottom: number;
      if (layout === 'stacked') {
        const from = negative ? down : up;
        const to = from + cell.value;
        if (negative) down = to;
        else up = to;
        top = y(Math.max(from, to));
        bottom = y(Math.min(from, to));
        const gap = Math.abs(from) > 0 ? SURFACE_GAP : 0;
        if (negative) top += gap;
        else bottom -= gap;
      } else {
        top = negative ? zero : y(cell.value);
        bottom = negative ? y(cell.value) : zero;
      }
      columns.push({
        x,
        y: top,
        width: thickness,
        height: Math.max(0, bottom - top),
        seriesIndex,
        datumIndex,
        cell,
        negative,
      });
      if (cell.band) {
        const bandTop = y(cell.band.high);
        bands.push({
          x,
          y: bandTop,
          width: thickness,
          height: Math.max(0, y(cell.band.low) - bandTop),
          seriesIndex,
          datumIndex,
        });
      }
    });
  });
  return { columns, bands };
}
