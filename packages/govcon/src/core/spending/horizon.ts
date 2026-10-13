import {
  AWARD_FAMILIES,
  type AwardFamily,
  type FamilyTotals,
  type HorizonBucket,
  type HorizonRow,
  type HorizonStop,
} from '@sysdesign/contracts';

import type { BudgetExhausted, SourceFailure } from '../budget';
import type { EndingAwardsPage } from '../ports';

/** One page as the gate answers it: the page, or why it was not fetched. */
export type HorizonPageAnswer =
  { kind: 'ok'; value: EndingAwardsPage } | BudgetExhausted | SourceFailure;

export interface HorizonWalkDeps {
  families: readonly AwardFamily[];
  /** Pages one family may spend: finding today's place in the list, then reading forward from it. */
  maxPages: number;
  /** The deepest page the source answers; today's place is sought no deeper. */
  maxDepth: number;
  /** Wall-clock budget for the whole walk; no page is asked for after it. */
  deadlineMs: number;
  now: () => Date;
  /** One page of one family, newest-ending first; `index` counts from 0 and the page asked for is `index + 1`. */
  page(family: AwardFamily, index: number): Promise<HorizonPageAnswer>;
}

export interface HorizonWalk {
  /** Every row ending inside the window, every family, each once. */
  rows: HorizonRow[];
  capped: boolean;
  stoppedBy: HorizonStop | null;
  /** When capped: awards ending before this date are all here; null when no part of the window is complete. */
  completeBefore: string | null;
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

/** Why a family's reading ended before it was done. */
interface Halt {
  stop: HorizonStop;
  failure: BudgetExhausted | SourceFailure | null;
}

type ReadPage = (index: number) => Promise<EndingAwardsPage | Halt>;

const isHalt = (answer: EndingAwardsPage | Halt): answer is Halt => 'stop' in answer;

/** The latest and the earliest end date on a page, which lists newest-ending first; null for a page with no rows. */
const firstEnd = (page: EndingAwardsPage): string | null => page.rows[0]?.endsAt ?? null;
const lastEnd = (page: EndingAwardsPage): string | null => page.rows.at(-1)?.endsAt ?? null;

/** No later page holds an award ending on or after `today`: this one already dips below it, is empty, or is the last. */
const reachesToday = (page: EndingAwardsPage, today: string): boolean => {
  const last = lastEnd(page);
  return last === null || last < today || !page.hasMore;
};

const earlier = (a: string | null, b: string): string => (a === null || b < a ? b : a);

/** One family's pages, each fetched at most once, inside the page bound and the deadline. */
function pageReader(deps: HorizonWalkDeps, family: AwardFamily, startedAt: number): ReadPage {
  const fetched = new Map<number, EndingAwardsPage>();
  return async (index) => {
    const known = fetched.get(index);
    if (known !== undefined) return known;
    if (deps.now().getTime() - startedAt >= deps.deadlineMs) {
      return { stop: 'deadline', failure: null };
    }
    if (fetched.size >= deps.maxPages) return { stop: 'pages', failure: null };
    const answer = await deps.page(family, index);
    if (answer.kind !== 'ok') return { stop: 'source', failure: answer };
    fetched.set(index, answer.value);
    return answer.value;
  };
}

/**
 * The first page that reaches today, found by doubling the page number until
 * one does and then halving the gap — a handful of pages however deep today
 * lies. A halt by the page bound when the deepest page the source answers
 * still ends after today: the scope holds more active awards than can be
 * paged to.
 */
async function locateToday(
  read: ReadPage,
  today: string,
  maxDepth: number,
): Promise<number | Halt> {
  // The deepest page known to end on or after today throughout.
  let above = -1;
  let index = 0;
  for (;;) {
    const page = await read(index);
    if (isHalt(page)) return page;
    if (reachesToday(page, today)) break;
    if (index >= maxDepth - 1) return { stop: 'pages', failure: null };
    above = index;
    index = Math.min(index * 2 + 1, maxDepth - 1);
  }
  let reaching = index;
  while (reaching - above > 1) {
    const middle = Math.floor((above + reaching) / 2);
    const page = await read(middle);
    if (isHalt(page)) return page;
    if (reachesToday(page, today)) reaching = middle;
    else above = middle;
  }
  return reaching;
}

interface FamilyWalk {
  /** Awards ending before this date are all read; null when none of the window is. */
  completeBefore: string | null;
  halt: Halt | null;
}

/**
 * From today's page toward later end dates — the soonest-ending awards
 * first — keeping what ends inside the window, until a page begins past the
 * window's end or the pages run out.
 */
async function readForward(
  read: ReadPage,
  from: number,
  window: { today: string; end: string },
  keep: (row: HorizonRow) => void,
): Promise<FamilyWalk> {
  let completeBefore: string | null = null;
  for (let index = from; index >= 0; index -= 1) {
    const page = await read(index);
    if (isHalt(page)) return { completeBefore, halt: page };
    for (const row of page.rows) {
      if (row.endsAt >= window.today && row.endsAt <= window.end) keep(row);
    }
    const first = firstEnd(page);
    if (first === null) continue;
    completeBefore = first;
    if (first > window.end) break;
  }
  return { completeBefore, halt: null };
}

/**
 * The walk, as pure orchestration over the gate. The source lists a scope's
 * awards newest-ending first and cannot filter by end date, so for each
 * family the walk finds the page where the end dates cross today, then reads
 * from there toward later end dates — the soonest-ending awards first, each
 * kept once. Three things cap it and name themselves: the page bound (per
 * family, the search and the reading together; the next family still walks,
 * and it also names a scope deeper than the source pages), the wall-clock
 * deadline, and a source that refused (never retried here; the ledger has
 * the attempt) — the last two end the whole walk. A capped walk is complete
 * for the awards ending before `completeBefore`, the near end of the window,
 * or for none of it when a family never found today's place.
 */
export async function walkHorizon(
  deps: HorizonWalkDeps,
  today: string,
  months: number,
): Promise<HorizonWalk> {
  const startedAt = deps.now().getTime();
  const window = { today, end: horizonEnd(today, months) };
  const kept = new Map<string, HorizonRow>();
  const keep = (row: HorizonRow): void => void kept.set(row.externalId, row);
  const walk: HorizonWalk = {
    rows: [],
    capped: false,
    stoppedBy: null,
    completeBefore: null,
    failure: null,
  };
  /** The earliest date a capped family is complete before. */
  let earliestCompleteBefore: string | null = null;
  /** A capped family read no part of the window, or never began. */
  let nothingComplete = false;
  /** The deadline or a refusing source ended the walk for every family. */
  let walkEnded = false;

  for (const family of deps.families) {
    if (walkEnded) {
      nothingComplete = true;
      continue;
    }
    const read = pageReader(deps, family, startedAt);
    const from = await locateToday(read, today, deps.maxDepth);
    const outcome: FamilyWalk =
      typeof from === 'number'
        ? await readForward(read, from, window, keep)
        : { completeBefore: null, halt: from };
    if (outcome.halt === null) continue;
    walk.capped = true;
    walk.failure ??= outcome.halt.failure;
    if (outcome.completeBefore === null) nothingComplete = true;
    else earliestCompleteBefore = earlier(earliestCompleteBefore, outcome.completeBefore);
    walkEnded = outcome.halt.stop !== 'pages';
    if (walkEnded || walk.stoppedBy === null) walk.stoppedBy = outcome.halt.stop;
  }
  walk.rows = [...kept.values()];
  walk.completeBefore = walk.capped && !nothingComplete ? earliestCompleteBefore : null;
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
