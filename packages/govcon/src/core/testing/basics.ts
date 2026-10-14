/**
 * The values almost every spec starts from: a profile every factor can price,
 * the instant the fakes stamp, a context with no award history, and the two
 * reads that fail as a spec can read.
 */
import { profileOf, type SearchProfile } from '@sysdesign/contracts';

import type { SavedSearchRecord } from '../ports';
import type { HistoryIndex, ScoringContext } from '../scoring';

export { opportunityOf } from '@sysdesign/contracts';

/** A small profile every factor can price; the factor ids must match `FACTORS`. */
export const tinyProfile = (overrides: Partial<SearchProfile> = {}): SearchProfile =>
  profileOf(overrides);

/** The item at `index`, or a failure a spec can read — never a non-null assertion. */
export function pick<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index} of ${items.length}`);
  return item;
}

/** A value a fake or a repository answered, or a failure a spec can read. */
export function must<T>(value: T | null | undefined | 'conflict'): T {
  if (value === null || value === undefined || value === 'conflict')
    throw new Error(`expected a value, got ${String(value)}`);
  return value;
}

/** The fixed instant the fakes stamp attempts with. */
export const T0 = new Date('2026-09-26T12:00:00.000Z');

/** No stored awards — the context of a ranking before any award was fetched. */
const NO_HISTORY: HistoryIndex = { countFor: () => ({ same: 0, agency: 0 }) };

/** A scoring context at `T0` with no stored awards. */
export const contextAt = (nowMs = T0.getTime()): ScoringContext => ({ nowMs, history: NO_HISTORY });

/** The two saved searches the tiny profile pulls, one per NAICS. */
export const tinySearches = (profileId = 'tiny'): SavedSearchRecord[] =>
  [
    { name: 'Machine shops', filter: { naics: '332710' }, pullOrder: 0 },
    { name: 'Computer services', filter: { naics: '5415' }, pullOrder: 1 },
  ].map((search, index) => ({
    id: `s-${index + 1}`,
    profileId,
    days: 3,
    includedInPull: true,
    lastRunAt: null,
    lastYield: null,
    createdAt: T0,
    updatedAt: T0,
    ...search,
  }));
