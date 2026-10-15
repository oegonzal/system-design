/**
 * Dates as the site's data declares them — ISO strings, each stated once — and
 * the forms the pages read them in.
 */

/** A calendar month: `YYYY-MM`. */
type Month = `${number}-${number}`;

/** A calendar day: `YYYY-MM-DD`. */
export type Day = `${number}-${number}-${number}`;

/**
 * A span of whole months, from the first through the last. Each page reads it
 * the way it needs: month by month (the About page) or by year (the capability
 * statement).
 */
export interface Period {
  readonly start: Month;
  readonly end: Month;
}

const MONTH = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/;
const DAY = /^([1-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** In UTC, so no time zone moves a date across a boundary. */
const utc = (year: string, month: string, day = '1'): Date =>
  new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

const parseMonth = (month: Month): Date => {
  const match = MONTH.exec(month);
  if (match === null) throw new Error(`"${month}" is not a YYYY-MM month.`);
  return utc(match[1], match[2]);
};

const parseDay = (day: Day): Date => {
  const match = DAY.exec(day);
  const date = match === null ? undefined : utc(match[1], match[2], match[3]);
  // A day the month does not have (2025-02-30) rolls into the next month.
  if (match === null || date?.getUTCDate() !== Number(match[3])) {
    throw new Error(`"${day}" is not a YYYY-MM-DD day.`);
  }
  return date;
};

const MONTH_NAME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DAY_NAME = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const months = ({ start, end }: Period): [Date, Date] => {
  const [first, last] = [parseMonth(start), parseMonth(end)];
  if (last < first) throw new Error(`A period cannot end (${end}) before it starts (${start}).`);
  return [first, last];
};

/** "Jan 2026 – Jul 2026", or one month when the period starts and ends in it. */
export const formatMonths = (period: Period): string =>
  [...new Set(months(period).map((month) => MONTH_NAME.format(month)))].join(' – ');

/** "2024–2026", or one year when the period starts and ends in it. */
export const formatYears = (period: Period): string =>
  [...new Set(months(period).map((month) => month.getUTCFullYear()))].join('–');

/** "March 1, 2024". */
export const formatDay = (day: Day): string => DAY_NAME.format(parseDay(day));

export const yearOf = (day: Day): number => parseDay(day).getUTCFullYear();
