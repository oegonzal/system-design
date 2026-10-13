import {
  FISCAL_PERIODS,
  isSettled,
  type FiscalPeriod,
  type PeriodObligations,
  type ProjectedPeriod,
  type Projection,
} from '@sysdesign/contracts';

/** The projection's one knob: how many settled periods of the current year before its run rate is trusted. */
export interface ProjectionPolicy {
  minimumBasePeriods: number;
}

export const PROJECTION_POLICY: ProjectionPolicy = { minimumBasePeriods: 2 };

/** Period → total obligated, for one fiscal year's settled periods. */
type ByPeriod = Map<number, number>;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

const totalsByYear = (series: readonly PeriodObligations[]): Map<number, ByPeriod> => {
  const years = new Map<number, ByPeriod>();
  for (const point of series) {
    if (!isSettled(point)) continue;
    const year = years.get(point.fiscalYear) ?? new Map<number, number>();
    year.set(point.period, point.total);
    years.set(point.fiscalYear, year);
  }
  return years;
};

/** The prior fiscal years with every period settled and something obligated — what a mean may rest on. */
const completePriorYears = (years: Map<number, ByPeriod>, current: FiscalPeriod): number[] =>
  [...years.entries()]
    .filter(
      ([fiscalYear, byPeriod]) =>
        fiscalYear < current.fiscalYear &&
        byPeriod.size === FISCAL_PERIODS &&
        sum([...byPeriod.values()]) !== 0,
    )
    .map(([fiscalYear]) => fiscalYear)
    .sort((a, b) => a - b);

/**
 * The periods of the current fiscal year that are not settled, projected as
 * declared arithmetic: `expected` is the mean of the complete prior years'
 * amounts in that period (their min and max the band), and `scaled` is that
 * mean times this year's run rate — the settled periods' actual over the
 * mean of the same periods — once at least `minimumBasePeriods` of them are
 * in. A period in progress, or one the source has not wholly published, is
 * projected and never counted in the base; a prior year with such a period
 * is not complete and no mean rests on it. Null without a complete prior
 * year. No fitting: the same series always gives the same projection.
 */
export function projectFiscalYear(
  series: readonly PeriodObligations[],
  current: FiscalPeriod,
  policy: ProjectionPolicy,
): Projection | null {
  const years = totalsByYear(series);
  const lookback = completePriorYears(years, current);
  if (lookback.length === 0) return null;

  const priorAt = (period: number): number[] =>
    lookback.map((fiscalYear) => years.get(fiscalYear)?.get(period) ?? 0);
  const settled = years.get(current.fiscalYear) ?? new Map<number, number>();
  const base = [...settled.keys()];
  const basePeriods = base.length;
  const actualBase = sum([...settled.values()]);
  const expectedBase = sum(base.map((period) => mean(priorAt(period))));
  const ratio =
    basePeriods >= policy.minimumBasePeriods && expectedBase > 0 ? actualBase / expectedBase : null;

  const periods: ProjectedPeriod[] = [];
  for (let period = 1; period <= FISCAL_PERIODS; period += 1) {
    if (settled.has(period)) continue;
    const values = priorAt(period);
    const expected = mean(values);
    periods.push({
      fiscalYear: current.fiscalYear,
      period,
      expected,
      scaled: ratio === null ? null : expected * ratio,
      low: Math.min(...values),
      high: Math.max(...values),
    });
  }
  return { method: 'seasonal-mean', lookbackFiscalYears: lookback, basePeriods, ratio, periods };
}
