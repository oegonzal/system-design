import type {
  Award,
  AwardeeShare,
  AwardsSummary,
  AwardSource,
  OffersBand,
} from '@sysdesign/contracts';

import type { HistoryRow } from './ports';
import type { HistoryIndex } from './scoring';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_AWARDEES = 5;

/** How many offers a bidder was up against, banded. */
export const offersBand = (offers: number | null): OffersBand =>
  offers === null ? 'unknown' : offers <= 1 ? 'one' : offers <= 4 ? 'few' : 'many';

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/**
 * The stored awards a query matched, summarized deterministically: how many,
 * for how much, the typical size, how contested, who keeps winning, what
 * set-asides the buyer used. Pure arithmetic over the records — the same
 * input always gives the same summary.
 */
export function summarizeAwards(awards: readonly Award[]): AwardsSummary {
  const amounts = awards
    .map((award) => award.amount)
    .filter((amount): amount is number => amount !== null);
  const offers: Record<OffersBand, number> = { one: 0, few: 0, many: 0, unknown: 0 };
  const setAsideMix: Record<string, number> = {};
  const bySource: Record<AwardSource, number> = { 'sam.gov': 0, usaspending: 0 };
  const awardees = new Map<string, AwardeeShare>();
  for (const award of awards) {
    offers[offersBand(award.offersReceived)] += 1;
    const setAside = award.setAsideCode ?? 'open';
    setAsideMix[setAside] = (setAsideMix[setAside] ?? 0) + 1;
    bySource[award.source] += 1;
    const key = award.awardeeUei ?? award.awardeeName;
    if (key === null) continue;
    const share = awardees.get(key) ?? {
      name: award.awardeeName ?? key,
      uei: award.awardeeUei,
      count: 0,
      total: 0,
    };
    share.count += 1;
    share.total += award.amount ?? 0;
    awardees.set(key, share);
  }
  return {
    count: awards.length,
    total: amounts.reduce((sum, amount) => sum + amount, 0),
    median: median(amounts),
    offers,
    topAwardees: [...awardees.values()]
      .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, TOP_AWARDEES),
    setAsideMix,
    bySource,
  };
}

/** The subtier segment of a `department.subtier.office` code — what an award and a notice share when the same buyer is behind both. */
export const subtierOf = (agencyCode: string | null): string | null => {
  const segment = agencyCode?.split('.')[1];
  return segment && segment.length > 0 ? segment : null;
};

/** The history factor's index over the stored awards: counts by NAICS inside a window, and how many of those were the notice's own subtier. */
export function awardHistoryOf(rows: readonly HistoryRow[], nowMs: number): HistoryIndex {
  return {
    countFor(naics, agencyCode, days) {
      if (naics === null) return { same: 0, agency: 0 };
      const since = nowMs - days * DAY_MS;
      const subtier = subtierOf(agencyCode);
      let same = 0;
      let agency = 0;
      for (const row of rows) {
        if (row.naicsCode !== naics || Date.parse(row.signedAt) < since) continue;
        same += 1;
        if (subtier !== null && subtierOf(row.agencyCode) === subtier) agency += 1;
      }
      return { same, agency };
    },
  };
}
