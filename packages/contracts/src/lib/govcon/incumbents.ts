import type { ApiResponse } from '../envelope';
import type { HorizonRow, Provenance, SpendingScope } from './spending';

// Incumbents — the awards a notice's own buyer holds in its code, ending in the coming months.

/** How far ahead a notice's incumbents are looked for: a requirement is announced up to two years before the award it replaces ends. */
export const INCUMBENT_HORIZON_MONTHS = 24;

/** What a notice may lack that the join needs: a NAICS code the source takes, or a buyer named down to its sub-agency. */
export const INCUMBENT_GAPS = ['naics', 'buyer'] as const;
export type IncumbentGap = (typeof INCUMBENT_GAPS)[number];

/**
 * Who may hold the work a notice is about: the awards in the notice's NAICS
 * code at its own sub-agency that end inside the coming months — the same
 * two facts an expiring award is matched to open notices by, read the other
 * way round. Candidates, not a confirmed match: each row's own record says
 * the rest.
 */
export interface NoticeIncumbents {
  noticeId: string;
  /** The notice lacks this fact, so nothing was read; null when it was. */
  gap: IncumbentGap | null;
  /** The scope the awards were read in; null with a gap. */
  scope: SpendingScope | null;
  /** ISO date the reading counted from, and how many months ahead it looked. */
  today: string;
  months: number;
  /** The awards at the notice's sub-agency, soonest-ending first. */
  rows: HorizonRow[];
  /** How many awards the scope listed before the buyer was matched. */
  listed: number;
  /** The walk ended before it covered the months: rows ending on or after `completeBefore` may be missing. */
  capped: boolean;
  completeBefore: string | null;
  /** Null with a gap: nothing was asked of any source. */
  provenance: Provenance | null;
}

export interface NoticeIncumbentsQuery {
  /** Narrow to the notice's own product service code when it has one; the default. */
  samePsc?: boolean;
}

export type GetNoticeIncumbentsResponse = ApiResponse<NoticeIncumbents>;
