import { MAX_PULL_DAYS, type PullWindow, type SearchProfile } from '@sysdesign/contracts';

import { canonicalQuery, type OpportunityQuery } from './query';

export type { PullWindow };

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** The `days` days up to and including today (UTC). */
export function windowEndingAt(now: Date, days: number): PullWindow {
  if (!Number.isInteger(days) || days < 1)
    throw new Error(`days must be a positive integer, got ${days}`);
  return validateWindow({
    from: isoDate(new Date(now.getTime() - days * DAY_MS)),
    to: isoDate(now),
  });
}

export function validateWindow(window: PullWindow): PullWindow {
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
 * The first page of every slice the profile declares, in declared order —
 * so when the budget runs out it is the last slices that go unpulled. Later
 * pages come from `nextPage` while the report is under `maxPagesPerSlice`.
 */
export function planPulls(profile: SearchProfile, window: PullWindow): OpportunityQuery[] {
  const { from, to } = validateWindow(window);
  return profile.pull.slices.map((slice) =>
    canonicalQuery({
      ...slice,
      postedFrom: from,
      postedTo: to,
      limit: profile.pull.pageSize,
      offset: 0,
    }),
  );
}
