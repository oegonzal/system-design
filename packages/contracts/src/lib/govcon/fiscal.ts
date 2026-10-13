/**
 * The federal fiscal calendar, pure. A fiscal year starts on October 1 and is
 * named for the calendar year it ends in, so October 2026 is period 1 of
 * FY2027. USAspending reports obligations by these periods, and every spending
 * lens and chart counts by them. Dates are ISO `YYYY-MM-DD`; every instant is
 * the caller's `nowMs`, read as UTC — nothing here consults a clock or a zone.
 */
export const FISCAL_PERIODS = 12;

/** Period 1..12 → the calendar month it is. */
export const PERIOD_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface FiscalPeriod {
  fiscalYear: number;
  /** 1 = October … 12 = September. */
  period: number;
}

/** The fiscal year and period an ISO date falls in. */
export const fiscalPeriodOf = (isoDate: string): FiscalPeriod => {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month >= 10
    ? { fiscalYear: year + 1, period: month - 9 }
    : { fiscalYear: year, period: month + 3 };
};

/** The UTC date of an instant, as the lenses spell "today". */
export const isoDateOf = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);

export const currentFiscalPeriod = (nowMs: number): FiscalPeriod =>
  fiscalPeriodOf(isoDateOf(nowMs));

/** The first day of a fiscal year, `YYYY-10-01` of the year before. */
export const fiscalYearStart = (fiscalYear: number): string => `${fiscalYear - 1}-10-01`;

/** The last day of a fiscal year, `YYYY-09-30`. */
export const fiscalYearEnd = (fiscalYear: number): string => `${fiscalYear}-09-30`;

/** The last day of a fiscal period — of the calendar month it is. */
export const fiscalPeriodEnd = ({ fiscalYear, period }: FiscalPeriod): string => {
  const month = PERIOD_MONTHS[period - 1];
  if (month === undefined) throw new RangeError(`fiscalPeriodEnd: no period ${period}`);
  // Periods 1–3 are October–December of the calendar year before.
  const year = month >= 10 ? fiscalYear - 1 : fiscalYear;
  return isoDateOf(Date.UTC(year, month, 0));
};

/** An ISO date moved back by whole days. */
export const daysBefore = (isoDate: string, days: number): string => {
  const at = new Date(`${isoDate}T00:00:00Z`);
  return isoDateOf(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - days));
};

/** A calendar month 1..12 as its three-letter label. */
export const monthLabel = (month: number): string => MONTH_LABELS[month - 1] ?? String(month);

/** A fiscal period 1..12 as the label of the month it is: `Oct` … `Sep`. */
export const periodMonthLabel = (period: number): string => {
  const month = PERIOD_MONTHS[period - 1];
  return month === undefined ? String(period) : monthLabel(month);
};
