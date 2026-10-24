/**
 * Business days between two ISO dates, read as UTC: the weekdays after
 * `fromIso` through `toIso`, so the day of an outreach counts for nothing and
 * the next Monday after a Friday counts one. Holidays are not kept — a table
 * of them would be declared data, read here, the day one is wanted. A `to`
 * before `from` is zero days.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const SATURDAY = 6;
const SUNDAY = 0;

const isWeekday = (date: Date): boolean => {
  const weekday = date.getUTCDay();
  return weekday !== SATURDAY && weekday !== SUNDAY;
};

export function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return 0;
  let days = 0;
  for (let at = from + DAY_MS; at <= to; at += DAY_MS) {
    if (isWeekday(new Date(at))) days += 1;
  }
  return days;
}
