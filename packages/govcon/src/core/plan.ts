import {
  DEFAULT_PULL_DAYS,
  MAX_PULL_DAYS,
  MIN_PULL_DAYS,
  type PullWindow,
  type QueryFilter,
  type SearchProfile,
  type StartPullRequest,
} from '@sysdesign/contracts';

import type { PlannedSlice } from './pull';
import { canonicalQuery } from './query';

export type { PullWindow };

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** The `days` days up to and including today (UTC). */
function windowEndingAt(now: Date, days: number): PullWindow {
  if (!Number.isInteger(days) || days < MIN_PULL_DAYS || days > MAX_PULL_DAYS) {
    throw new Error(
      `days must be an integer from ${MIN_PULL_DAYS} to ${MAX_PULL_DAYS}, got ${days}`,
    );
  }
  return validateWindow({
    from: isoDate(new Date(now.getTime() - days * DAY_MS)),
    to: isoDate(now),
  });
}

function validateWindow(window: PullWindow): PullWindow {
  if (!ISO_DATE.test(window.from) || !ISO_DATE.test(window.to)) {
    throw new Error(`window dates must be YYYY-MM-DD, got ${window.from}..${window.to}`);
  }
  const from = Date.parse(`${window.from}T00:00:00Z`);
  const to = Date.parse(`${window.to}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error(`window dates must be real dates, got ${window.from}..${window.to}`);
  }
  if (from > to) throw new Error(`window starts after it ends: ${window.from}..${window.to}`);
  if ((to - from) / DAY_MS > MAX_PULL_DAYS) {
    throw new Error(`window spans more than ${MAX_PULL_DAYS} days: ${window.from}..${window.to}`);
  }
  return window;
}

/**
 * The one window rule, for the CLI and the HTTP body alike: an explicit
 * `from`..`to`, or the last `days` days ending today (UTC), never both, and
 * `DEFAULT_PULL_DAYS` when neither is given. Throws a plain Error naming
 * the problem; the edge decides what status that is.
 */
export function resolveWindow(
  request: Pick<StartPullRequest, 'days' | 'from' | 'to'>,
  now: Date,
): PullWindow {
  const explicit = request.from !== undefined || request.to !== undefined;
  if (explicit && (request.from === undefined || request.to === undefined)) {
    throw new Error('from and to go together');
  }
  if (explicit && request.days !== undefined) throw new Error('days and from/to are alternatives');
  return request.from !== undefined && request.to !== undefined
    ? validateWindow({ from: request.from, to: request.to })
    : windowEndingAt(now, request.days ?? DEFAULT_PULL_DAYS);
}

/** What the plan needs of a saved search. */
export interface PlannableSearch {
  name: string;
  filter: QueryFilter;
  includedInPull: boolean;
  pullOrder: number;
}

/**
 * The first page of every saved search flagged for the pull, in `pullOrder`
 * — so when the budget runs out it is the last ones that go unpulled. Later
 * pages come from `nextPage` while the report is under `maxPagesPerSlice`.
 */
export function planPulls(
  profile: SearchProfile,
  searches: readonly PlannableSearch[],
  window: PullWindow,
): PlannedSlice[] {
  const { from, to } = validateWindow(window);
  return searches
    .filter((search) => search.includedInPull)
    .sort((a, b) => a.pullOrder - b.pullOrder || a.name.localeCompare(b.name))
    .map((search) => ({
      name: search.name,
      query: canonicalQuery({
        ...search.filter,
        postedFrom: from,
        postedTo: to,
        limit: profile.pull.pageSize,
        offset: 0,
      }),
    }));
}

/** One search run by itself: the same slice a pull would run, under its name. */
export function planSearch(
  profile: SearchProfile,
  name: string | null,
  filter: QueryFilter,
  window: PullWindow,
): PlannedSlice {
  const { from, to } = validateWindow(window);
  return {
    name,
    query: canonicalQuery({
      ...filter,
      postedFrom: from,
      postedTo: to,
      limit: profile.pull.pageSize,
      offset: 0,
    }),
  };
}
