/**
 * What every table of the quality loop keeps the same way: timestamps as
 * `Date` in a row and ISO on the wire, newest rows first, filters only for
 * what a query names, who opened a record as three columns, and the error
 * the janitor writes on a row whose heartbeat went stale.
 */
import type { RunErrorDto, RunOpenerDto } from '@sysdesign/contracts';

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

/** The three columns a record's opener is kept in, so its id can be indexed and filtered by. */
export interface OpenerColumns {
  openedByKind: RunOpenerDto['kind'] | null;
  openedById: string | null;
  openedByLabel: string | null;
}

/** An opener as its columns: all three null when nobody said. */
export const openerColumns = (openedBy: RunOpenerDto | null): OpenerColumns => ({
  openedByKind: openedBy?.kind ?? null,
  openedById: openedBy?.id ?? null,
  openedByLabel: openedBy?.label ?? null,
});

/** The opener its columns hold; null for a record nobody named, every row older than the columns included. */
export const openerOf = (columns: OpenerColumns): RunOpenerDto | null =>
  columns.openedByKind === null || columns.openedById === null
    ? null
    : { kind: columns.openedByKind, id: columns.openedById, label: columns.openedByLabel ?? '' };

/** The name a swept row's error carries — what `close` looks for to reclaim it. */
export const INTERRUPTED = 'Interrupted';

/** The error a run carries when its heartbeat went stale: the process that owned it died or stalled. */
export const interruptedError = (what: string): RunErrorDto => ({
  name: INTERRUPTED,
  message: `the ${what}'s heartbeat went stale — the process that owned it died or stalled`,
  stack: null,
});
