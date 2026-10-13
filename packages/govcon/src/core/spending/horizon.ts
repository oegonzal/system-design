import {
  AWARD_FAMILIES,
  type AwardFamily,
  type FamilyTotals,
  type HorizonBucket,
  type HorizonCursor,
  type HorizonRow,
  type HorizonStop,
} from '@sysdesign/contracts';

import type { BudgetExhausted, Gated, SourceFailure } from '../budget';
import type { EndingAwardsPage } from '../ports';

export interface HorizonWalkDeps {
  families: readonly AwardFamily[];
  /** Pages per family before the walk is capped. */
  maxPages: number;
  /** Wall-clock budget for the whole walk; no page is asked for after it. */
  deadlineMs: number;
  now: () => Date;
  /** One page of one family, newest-ending first, after the cursor. */
  page(
    family: AwardFamily,
    after: HorizonCursor | null,
    index: number,
  ): Promise<Gated<EndingAwardsPage>>;
}

export interface HorizonWalk {
  /** Every row ending inside the window, every family. */
  rows: HorizonRow[];
  rejected: number;
  capped: boolean;
  stoppedBy: HorizonStop | null;
  /** When capped: the earliest end date reached; the months after it are complete. */
  reachedEndsAt: string | null;
  failure: BudgetExhausted | SourceFailure | null;
}

export interface YearMonth {
  year: number;
  month: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The calendar months from today's, `months` long. */
export function monthsAhead(today: string, months: number): YearMonth[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return Array.from({ length: months }, (_, index) => {
    const offset = month - 1 + index;
    return { year: year + Math.floor(offset / 12), month: (offset % 12) + 1 };
  });
}

const lastDayOf = ({ year, month }: YearMonth): string =>
  `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

/** The last day of the horizon, ISO. */
export const horizonEnd = (today: string, months: number): string => {
  const last = monthsAhead(today, months).at(-1);
  return last === undefined ? today : lastDayOf(last);
};

const later = (a: string | null, b: string): string => (a === null || b > a ? b : a);

/**
 * The walk, as pure orchestration over the gate: each family in turn, pages
 * newest-ending first, keeping what ends inside the window, skipping what
 * ends past it, and done with a family the moment a row ends before today —
 * the predicate is checked on the page just received, before the next is
 * asked for. Three things cap it and name themselves: the page bound (per
 * family; the next family still walks), the wall-clock deadline, and a
 * source that refused (never retried here; the ledger has the attempt). A
 * capped walk says how far it got, so the months after `reachedEndsAt` can
 * be read as complete.
 */
export async function walkHorizon(
  deps: HorizonWalkDeps,
  today: string,
  months: number,
): Promise<HorizonWalk> {
  const startedAt = deps.now().getTime();
  const windowEnd = horizonEnd(today, months);
  const walk: HorizonWalk = {
    rows: [],
    rejected: 0,
    capped: false,
    stoppedBy: null,
    reachedEndsAt: null,
    failure: null,
  };
  const cap = (stop: HorizonStop, earliest: string | null): void => {
    walk.capped = true;
    walk.stoppedBy = stop;
    walk.reachedEndsAt = later(walk.reachedEndsAt, earliest ?? windowEnd);
  };

  for (const family of deps.families) {
    let after: HorizonCursor | null = null;
    let earliest: string | null = null;
    for (let index = 0; index < deps.maxPages; index += 1) {
      if (deps.now().getTime() - startedAt >= deps.deadlineMs) {
        cap('deadline', earliest);
        return walk;
      }
      const result = await deps.page(family, after, index);
      if (result.kind === 'cached') break;
      if (result.kind !== 'ok') {
        walk.failure = result;
        cap('source', earliest);
        return walk;
      }
      walk.rejected += result.value.rejected;
      let done = result.value.next === null;
      for (const row of result.value.rows) {
        if (row.endsAt > windowEnd) continue;
        if (row.endsAt < today) {
          done = true;
          break;
        }
        walk.rows.push(row);
        earliest = row.endsAt;
      }
      if (done) break;
      if (index + 1 === deps.maxPages) {
        cap('pages', earliest);
        break;
      }
      after = result.value.next;
    }
  }
  return walk;
}

const emptyTotals = (): Record<AwardFamily, FamilyTotals> =>
  Object.fromEntries(AWARD_FAMILIES.map((family) => [family, { count: 0, amount: 0 }])) as Record<
    AwardFamily,
    FamilyTotals
  >;

/** Every row ending inside the window, counted and summed into its calendar month per family. */
export function bucketHorizon(
  rows: readonly HorizonRow[],
  today: string,
  months: number,
): HorizonBucket[] {
  const buckets: HorizonBucket[] = monthsAhead(today, months).map((at) => ({
    ...at,
    ...emptyTotals(),
  }));
  const at = new Map(buckets.map((bucket, index) => [`${bucket.year}-${bucket.month}`, index]));
  const windowEnd = horizonEnd(today, months);
  for (const row of rows) {
    if (row.endsAt < today || row.endsAt > windowEnd) continue;
    const index = at.get(`${Number(row.endsAt.slice(0, 4))}-${Number(row.endsAt.slice(5, 7))}`);
    const bucket = index === undefined ? undefined : buckets[index];
    if (bucket === undefined) continue;
    bucket[row.family].count += 1;
    bucket[row.family].amount += row.amount;
  }
  return buckets;
}

/** The soonest-ending rows, at most `limit`, ties broken by id so the order is one order. */
export const soonestRows = (rows: readonly HorizonRow[], limit: number): HorizonRow[] =>
  [...rows]
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.externalId.localeCompare(b.externalId))
    .slice(0, limit);
