import {
  FISCAL_PERIODS,
  periodMonthLabel,
  type AgencyYear,
  type SpendingPulse,
} from '@sysdesign/contracts';
import {
  CHART_SERIES_LIMIT,
  type ColumnDatum,
  type ColumnSeries,
  type ColumnValue,
} from '@sysdesign/design-system';

/** One fiscal year's cells by period — what both period charts are built from. */
export interface PeriodYear {
  fiscalYear: number;
  cells: ReadonlyMap<number, ColumnValue>;
}

const seriesId = (fiscalYear: number): string => `fy${fiscalYear}`;

/**
 * The one mapping both period charts share: twelve fiscal periods along the
 * x, one series per fiscal year newest first, no more than the chart can
 * show. A period a year has no cell for leaves no mark.
 */
export function periodColumns(
  years: readonly PeriodYear[],
  limit = CHART_SERIES_LIMIT,
): { series: ColumnSeries[]; data: ColumnDatum[] } {
  const shown = [...years].sort((a, b) => b.fiscalYear - a.fiscalYear).slice(0, limit);
  const series = shown.map((year) => ({
    id: seriesId(year.fiscalYear),
    label: `FY${year.fiscalYear}`,
  }));
  const data = Array.from({ length: FISCAL_PERIODS }, (_, index) => {
    const period = index + 1;
    const values: Record<string, ColumnValue> = {};
    for (const year of shown) {
      const cell = year.cells.get(period);
      if (cell !== undefined) values[seriesId(year.fiscalYear)] = cell;
    }
    return { label: periodMonthLabel(period), values };
  });
  return { series, data };
}

/** The pulse as period years: reported periods as measured (the one in progress provisional), the rest of this year projected with its band. */
export function pulseYears(pulse: SpendingPulse): PeriodYear[] {
  const byYear = new Map<number, Map<number, ColumnValue>>();
  for (const point of pulse.series) {
    const cells = byYear.get(point.fiscalYear) ?? new Map<number, ColumnValue>();
    cells.set(
      point.period,
      point.partial ? { value: point.total, provisional: true } : point.total,
    );
    byYear.set(point.fiscalYear, cells);
  }
  const current = byYear.get(pulse.fiscalYear) ?? new Map<number, ColumnValue>();
  for (const period of pulse.projection?.periods ?? []) {
    if (current.has(period.period)) continue;
    current.set(period.period, {
      value: period.scaled ?? period.expected,
      projected: true,
      band: { low: period.low, high: period.high },
    });
  }
  if (current.size > 0) byYear.set(pulse.fiscalYear, current);
  return [...byYear.entries()].map(([fiscalYear, cells]) => ({ fiscalYear, cells }));
}

/** An agency's years as period years: the periods the source reported, as reported. */
export const agencyYears = (years: readonly AgencyYear[]): PeriodYear[] =>
  years.map((year) => ({
    fiscalYear: year.fiscalYear,
    cells: new Map(year.byPeriod.map((point) => [point.period, point.obligated])),
  }));
