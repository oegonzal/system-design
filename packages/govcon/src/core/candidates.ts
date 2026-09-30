import { MAX_CANDIDATES, type ListLeadsQuery, type SearchProfile } from '@sysdesign/contracts';

import type { CandidateFilter } from './ports';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The store-side filters a lead request may add on top of the profile's gates. */
export type LeadFilters = Pick<
  ListLeadsQuery,
  'naics' | 'setAside' | 'noticeType' | 'agency' | 'q' | 'deadlineWithinDays'
>;

/**
 * What the store is asked for before anything is scored: the profile's
 * gates pushed down (active, open deadline, a set-aside it may bid on or
 * none, no excluded notice type, posted inside the leads horizon) plus the
 * request's filters, bounded by
 * `MAX_CANDIDATES` so one ranking never reads the whole table. Everything a
 * gate would exclude anyway is never loaded; everything else is scored.
 */
export function candidateFilterOf(
  profile: SearchProfile,
  filters: LeadFilters,
  now: Date,
): CandidateFilter {
  return {
    activeOnly: true,
    postedOnOrAfter: new Date(now.getTime() - profile.leads.horizonDays * DAY_MS),
    deadlineOnOrAfter: now,
    deadlineOnOrBefore:
      filters.deadlineWithinDays === undefined
        ? null
        : new Date(now.getTime() + filters.deadlineWithinDays * DAY_MS),
    setAsideCodes: Object.keys(profile.scoring.setAside.byCode),
    excludeNoticeTypes: profile.scoring.noticeType.exclude,
    naicsPrefix: filters.naics ?? null,
    setAsideCode: filters.setAside ?? null,
    noticeType: filters.noticeType ?? null,
    agencyContains: filters.agency ?? null,
    textContains: filters.q ?? null,
    limit: MAX_CANDIDATES,
  };
}
