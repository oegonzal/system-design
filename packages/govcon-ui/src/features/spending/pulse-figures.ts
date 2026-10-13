import {
  FISCAL_PERIODS,
  isSettled,
  type PeriodObligations,
  type ProjectedPeriod,
  type SpendingPulse,
} from '@sysdesign/contracts';

export interface Range {
  amount: number;
  low: number;
  high: number;
}

/** This year against the prior one over the periods both have settled — like with like. */
export interface Comparison {
  /** The last period compared. */
  throughPeriod: number;
  now: number;
  then: number;
}

/** The pulse's headline figures, pure sums over what the lens answered. */
export interface PulseFigures {
  fiscalYear: number;
  /** The last period reported, settled or not. */
  throughPeriod: number;
  toDate: number;
  /** The prior year through the same period; null without a prior year. */
  priorToDate: number | null;
  /** Null until a period of this year is settled and the prior year settled it too. */
  comparison: Comparison | null;
  /** The prior year's whole; null unless every period is settled. */
  priorTotal: number | null;
  /** What the projection adds to the year to date, with its band; null without a projection. */
  remainder: Range | null;
  projectedTotal: Range | null;
}

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const totalOf = (points: readonly PeriodObligations[]): number =>
  sum(points.map((point) => point.total));

function comparisonOf(
  current: readonly PeriodObligations[],
  prior: readonly PeriodObligations[],
): Comparison | null {
  const then = new Map(prior.filter(isSettled).map((point) => [point.period, point.total]));
  const shared = current.filter((point) => isSettled(point) && then.has(point.period));
  const last = shared.at(-1);
  if (last === undefined) return null;
  return {
    throughPeriod: last.period,
    now: totalOf(shared),
    then: sum(shared.map((point) => then.get(point.period) ?? 0)),
  };
}

/** The settled periods of this year plus the projection of every other one, by whichever figure of it. */
function projectedTotalOf(
  current: readonly PeriodObligations[],
  periods: readonly ProjectedPeriod[],
): Range {
  const settled = totalOf(current.filter(isSettled));
  const projected = (pick: (period: ProjectedPeriod) => number): number =>
    settled + sum(periods.map(pick));
  return {
    amount: projected((period) => period.scaled ?? period.expected),
    low: projected((period) => period.low),
    high: projected((period) => period.high),
  };
}

export function pulseFigures(pulse: SpendingPulse): PulseFigures {
  const current = pulse.series.filter((point) => point.fiscalYear === pulse.fiscalYear);
  const prior = pulse.series.filter((point) => point.fiscalYear === pulse.fiscalYear - 1);
  const throughPeriod = current.at(-1)?.period ?? 0;
  const toDate = totalOf(current);
  const projectedTotal =
    pulse.projection === null ? null : projectedTotalOf(current, pulse.projection.periods);
  return {
    fiscalYear: pulse.fiscalYear,
    throughPeriod,
    toDate,
    priorToDate:
      prior.length === 0 ? null : totalOf(prior.filter((point) => point.period <= throughPeriod)),
    comparison: comparisonOf(current, prior),
    priorTotal: prior.length === FISCAL_PERIODS && prior.every(isSettled) ? totalOf(prior) : null,
    remainder:
      projectedTotal === null
        ? null
        : {
            amount: projectedTotal.amount - toDate,
            low: projectedTotal.low - toDate,
            high: projectedTotal.high - toDate,
          },
    projectedTotal,
  };
}
