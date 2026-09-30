/**
 * What every table of the quality loop keeps the same way: timestamps as
 * `Date` in a row and ISO on the wire, newest rows first, filters only for
 * what a query names, and the error the janitor writes on a row whose
 * heartbeat went stale.
 */
import type { RunErrorDto } from '@sysdesign/contracts';

export const toDate = (iso: string): Date => new Date(iso);
export const toDateOrNull = (iso: string | null): Date | null =>
  iso === null ? null : new Date(iso);
export const toIso = (at: Date): string => at.toISOString();
export const toIsoOrNull = (at: Date | null | undefined): string | null =>
  at?.toISOString() ?? null;

/** Newest first, the id breaking ties so a page never repeats a row. */
export const NEWEST_FIRST = { startedAt: 'desc', id: 'desc' } as const;

/** Only the filters a query names; an absent one matches everything. */
export const presentFilters = <T extends Record<string, string | undefined>>(
  filters: T,
): { [K in keyof T]?: NonNullable<T[K]> } =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))) as {
    [K in keyof T]?: NonNullable<T[K]>;
  };

/** The name a swept row's error carries — what `close` looks for to reclaim it. */
export const INTERRUPTED = 'Interrupted';

/** The error a run carries when its heartbeat went stale: the process that owned it died or stalled. */
export const interruptedError = (what: string): RunErrorDto => ({
  name: INTERRUPTED,
  message: `the ${what}'s heartbeat went stale — the process that owned it died or stalled`,
  stack: null,
});
