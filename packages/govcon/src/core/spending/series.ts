import { FISCAL_PERIODS, type FiscalPeriod, type PeriodObligations } from '@sysdesign/contracts';

import type { SeriesPoint } from '../ports';

export interface FiscalWindow {
  fromFiscalYear: number;
  toFiscalYear: number;
}

interface Sums {
  contracts: number;
  idvs: number;
  total: number;
}

const keyOf = (fiscalYear: number, period: number): string => `${fiscalYear}:${period}`;
const nothing = (): Sums => ({ contracts: 0, idvs: 0, total: 0 });

/** Twelve for a past year, the period in progress for the current one, none for a year not begun. */
const lastPeriodOf = (fiscalYear: number, current: FiscalPeriod): number =>
  fiscalYear < current.fiscalYear
    ? FISCAL_PERIODS
    : fiscalYear === current.fiscalYear
      ? current.period
      : 0;

/**
 * The source's points aligned on the periods asked for: every fiscal year of
 * the window gets its twelve periods, zero where the source reported none and
 * summed where it reported several, except the current year, which ends at
 * the period in progress — marked `partial`, since its amount is still
 * growing. Points outside the window, or without a period, are dropped;
 * negative amounts (de-obligations) are carried as they are.
 */
export function alignSeries(
  points: readonly SeriesPoint[],
  window: FiscalWindow,
  current: FiscalPeriod,
): PeriodObligations[] {
  const sums = new Map<string, Sums>();
  for (const point of points) {
    if (point.period === null || point.period < 1 || point.period > FISCAL_PERIODS) continue;
    const key = keyOf(point.fiscalYear, point.period);
    const sum = sums.get(key) ?? nothing();
    sum.contracts += point.contracts;
    sum.idvs += point.idvs;
    sum.total += point.total;
    sums.set(key, sum);
  }

  const aligned: PeriodObligations[] = [];
  for (let fiscalYear = window.fromFiscalYear; fiscalYear <= window.toFiscalYear; fiscalYear += 1) {
    const last = lastPeriodOf(fiscalYear, current);
    for (let period = 1; period <= last; period += 1) {
      aligned.push({
        fiscalYear,
        period,
        ...(sums.get(keyOf(fiscalYear, period)) ?? nothing()),
        partial: fiscalYear === current.fiscalYear && period === current.period,
      });
    }
  }
  return aligned;
}
