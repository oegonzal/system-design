import {
  FISCAL_PERIODS,
  type AgencyDirectoryEntry,
  type AgencyYear,
  type BreakdownRow,
} from '@sysdesign/contracts';

/**
 * An agency's years as the source reported them, made regular: newest year
 * first; within a year the periods present, ascending, one row per period
 * (the last reported wins), nothing outside 1..12. The source reports
 * monthly in recent years and quarterly before, and a year just begun with
 * nothing yet — all three are kept as they are, never padded to twelve.
 */
export function alignAgencyYears(years: readonly AgencyYear[]): AgencyYear[] {
  return [...years]
    .sort((a, b) => b.fiscalYear - a.fiscalYear)
    .map((year) => {
      const byPeriod = new Map<number, number>();
      for (const point of year.byPeriod) {
        if (point.period >= 1 && point.period <= FISCAL_PERIODS)
          byPeriod.set(point.period, point.obligated);
      }
      return {
        ...year,
        byPeriod: [...byPeriod.entries()]
          .sort(([a], [b]) => a - b)
          .map(([period, obligated]) => ({ period, obligated })),
      };
    });
}

/**
 * The toptier codes of the first `limit` breakdown rows the directory knows,
 * through the source's own id — a row's `id` is the directory's `agencyId`;
 * a row without an id, or one the directory lacks, is skipped. Never a name.
 */
export function topAgencyCodes(
  rows: readonly BreakdownRow[],
  entries: readonly AgencyDirectoryEntry[],
  limit: number,
): string[] {
  const byId = new Map(entries.map((entry) => [String(entry.agencyId), entry.toptierCode]));
  return rows
    .flatMap((row) => {
      const code = row.id === null ? undefined : byId.get(row.id);
      return code === undefined ? [] : [code];
    })
    .slice(0, limit);
}

/** The directory entry with this toptier code, or null. */
export const agencyNamed = (
  entries: readonly AgencyDirectoryEntry[],
  toptierCode: string,
): AgencyDirectoryEntry | null =>
  entries.find((entry) => entry.toptierCode === toptierCode) ?? null;
