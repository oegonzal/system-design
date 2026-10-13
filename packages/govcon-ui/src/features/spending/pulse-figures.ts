import { FISCAL_PERIODS, type ProjectedPeriod, type SpendingPulse } from '@sysdesign/contracts';

export interface Range {
  amount: number;
  low: number;
  high: number;
}

/** The pulse's headline figures, pure sums over what the lens answered. */
export interface PulseFigures {
  fiscalYear: number;
  /** The last period reported, partial or not. */
  throughPeriod: number;
  toDate: number;
  /** The prior year through the same period; null without a prior year. */
  priorToDate: number | null;
  /** The prior year's whole; null unless every period was reported. */
  priorTotal: number | null;
  /** What the projection adds to the year to date, with its band; null without a projection. */
  remainder: Range | null;
  projectedTotal: Range | null;
}

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

export function pulseFigures(pulse: SpendingPulse): PulseFigures {
  const current = pulse.series.filter((point) => point.fiscalYear === pulse.fiscalYear);
  const throughPeriod = current.at(-1)?.period ?? 0;
  const toDate = sum(current.map((point) => point.total));
  const prior = pulse.series.filter((point) => point.fiscalYear === pulse.fiscalYear - 1);
  const priorToDate =
    prior.length === 0
      ? null
      : sum(prior.filter((point) => point.period <= throughPeriod).map((point) => point.total));
  const priorTotal =
    prior.length === FISCAL_PERIODS ? sum(prior.map((point) => point.total)) : null;

  const projection = pulse.projection;
  if (projection === null) {
    return {
      fiscalYear: pulse.fiscalYear,
      throughPeriod,
      toDate,
      priorToDate,
      priorTotal,
      remainder: null,
      projectedTotal: null,
    };
  }
  const completed = sum(current.filter((point) => !point.partial).map((point) => point.total));
  const projected = (pick: (period: ProjectedPeriod) => number): number =>
    completed + sum(projection.periods.map(pick));
  const projectedTotal: Range = {
    amount: projected((period) => period.scaled ?? period.expected),
    low: projected((period) => period.low),
    high: projected((period) => period.high),
  };
  return {
    fiscalYear: pulse.fiscalYear,
    throughPeriod,
    toDate,
    priorToDate,
    priorTotal,
    remainder: {
      amount: projectedTotal.amount - toDate,
      low: projectedTotal.low - toDate,
      high: projectedTotal.high - toDate,
    },
    projectedTotal,
  };
}
