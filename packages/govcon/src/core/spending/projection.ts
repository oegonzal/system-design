import {
  FISCAL_PERIODS,
  type FiscalPeriod,
  type PeriodObligations,
  type ProjectedPeriod,
  type Projection,
} from '@sysdesign/contracts';

/** The projection's one knob: how many complete periods of the current year before its run rate is trusted. */
export interface ProjectionPolicy {
  minimumBasePeriods: number;
}

export const PROJECTION_POLICY: ProjectionPolicy = { minimumBasePeriods: 2 };

/** Period → total obligated, for one fiscal year. */
type ByPeriod = Map<number, number>;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

const totalsByYear = (series: readonly PeriodObligations[]): Map<number, ByPeriod> => {
  const years = new Map<number, ByPeriod>();
  for (const point of series) {
    if (point.partial) continue;
    const year = years.get(point.fiscalYear) ?? new Map<number, number>();
    year.set(point.period, point.total);
    years.set(point.fiscalYear, year);
  }
  return years;
};

/** The prior fiscal years with every period reported and something obligated — what a mean may rest on. */
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
 * The remaining periods of the current fiscal year, projected as declared
 * arithmetic: `expected` is the mean of the complete prior years' amounts in
 * that period (their min and max the band), and `scaled` is that mean times
 * this year's run rate — the year-to-date actual over the year-to-date mean —
 * once at least `minimumBasePeriods` periods are complete. The period in
 * progress is projected, never counted in the base. Null without a complete
 * prior year to rest on. No fitting: the same series always gives the same
 * projection.
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
  const basePeriods = current.period - 1;
  const base = Array.from({ length: basePeriods }, (_, index) => index + 1);
  const actualBase = sum(base.map((period) => years.get(current.fiscalYear)?.get(period) ?? 0));
  const expectedBase = sum(base.map((period) => mean(priorAt(period))));
  const ratio =
    basePeriods >= policy.minimumBasePeriods && expectedBase > 0 ? actualBase / expectedBase : null;

  const periods: ProjectedPeriod[] = [];
  for (let period = current.period; period <= FISCAL_PERIODS; period += 1) {
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
