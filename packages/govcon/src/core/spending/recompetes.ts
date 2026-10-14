import {
  MAX_RECOMPETE_NOTICES,
  noticeRefOf,
  type HorizonNoticeMatch,
  type HorizonRow,
  type NoticeRef,
  type Opportunity,
} from '@sysdesign/contracts';

import { subtierOf } from '../agency-path';
import type { CandidateFilter } from '../ports';

/**
 * Recompetes: an award ending soon beside the open notices already in the
 * store for the same work and the same buyer. The two share exactly two
 * declared facts — the NAICS code and the agency's sub-tier segment (SAM.gov
 * spells `department.subtier.office`, USAspending `toptier.subtier`) — so the
 * join is those two and nothing read off a name.
 */

/** What the join reads of an award: its id and the two facts it shares with a notice. */
export type JoinedAward = Pick<HorizonRow, 'externalId' | 'naicsCode' | 'agencyCode'>;

/** The distinct NAICS codes the rows name, sorted — what the store is asked for; empty when no row has one. */
export const horizonNaics = (rows: readonly JoinedAward[]): string[] =>
  [...new Set(rows.flatMap((row) => (row.naicsCode === null ? [] : [row.naicsCode])))].sort();

/**
 * Open stored notices in these codes: active, deadline not passed (none
 * stated stays in), nothing else — the join is a fact about the store, not
 * about any profile's gates.
 */
export const openNoticesFilter = (naicsCodes: readonly string[], now: Date): CandidateFilter => ({
  activeOnly: true,
  postedOnOrAfter: null,
  deadlineOnOrAfter: now,
  deadlineOnOrBefore: null,
  setAsideCodes: null,
  excludeNoticeTypes: [],
  naicsPrefix: null,
  naicsCodes,
  setAsideCode: null,
  noticeTypes: null,
  agencyContains: null,
  textContains: null,
  limit: MAX_RECOMPETE_NOTICES,
});

/** The two facts a row and a notice are joined on, or null when either is missing. */
const joinKeyOf = (naicsCode: string | null, agencyCode: string | null): string | null => {
  const subtier = subtierOf(agencyCode);
  return naicsCode === null || subtier === null ? null : `${naicsCode}|${subtier}`;
};

/** Soonest deadline first, none last, ties by id — one order. */
const byDeadlineThenId = (a: NoticeRef, b: NoticeRef): number => {
  if (a.responseDeadlineAt === b.responseDeadlineAt) return a.noticeId.localeCompare(b.noticeId);
  if (a.responseDeadlineAt === null) return 1;
  if (b.responseDeadlineAt === null) return -1;
  return a.responseDeadlineAt.localeCompare(b.responseDeadlineAt);
};

/**
 * The rows joined to the notices on the two facts both declare. A row or a
 * notice missing either never matches, and a row with no match is absent.
 * Rows keep the order given.
 */
export function matchOpenNotices(
  rows: readonly JoinedAward[],
  notices: readonly Opportunity[],
): HorizonNoticeMatch[] {
  const byKey = new Map<string, NoticeRef[]>();
  for (const notice of notices) {
    const key = joinKeyOf(notice.naicsCode, notice.agencyCode);
    if (key === null) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), noticeRefOf(notice)]);
  }
  const matches: HorizonNoticeMatch[] = [];
  for (const row of rows) {
    const key = joinKeyOf(row.naicsCode, row.agencyCode);
    const found = key === null ? undefined : byKey.get(key);
    if (found === undefined) continue;
    matches.push({ externalId: row.externalId, notices: [...found].sort(byDeadlineThenId) });
  }
  return matches;
}
