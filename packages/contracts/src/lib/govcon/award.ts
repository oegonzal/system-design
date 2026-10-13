import type { ApiListResponse, ApiResponse } from '../envelope';
import type { OpportunityPlace } from './opportunity';
import type { AwardSource, SliceOutcome } from './vocab';

/**
 * A contract award as stored: SAM.gov's Contract Awards record or a
 * USAspending award, normalized to one shape and keyed by `(source,
 * externalId)`. Prices what the government paid, to whom, and how many
 * offers it took — the intel a bid is priced against.
 */
export interface Award {
  source: AwardSource;
  externalId: string;
  /** The contract id as the source spells it (the PIID). */
  piid: string | null;
  /** The award's type as the source names it, e.g. `PURCHASE ORDER`. */
  awardType: string | null;
  solicitationNumber: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  /** `department.subtier.office` names, as a notice spells its path. */
  agencyPath: string | null;
  /** `department.subtier.office` codes; the subtier is what relates an award to a notice's agency. */
  agencyCode: string | null;
  awardeeName: string | null;
  awardeeUei: string | null;
  amount: number | null;
  offersReceived: number | null;
  /** SAM.gov's `extentCompeted` code, e.g. `A` full and open; open by design. */
  extentCompeted: string | null;
  setAsideCode: string | null;
  /** ISO date — when the award was signed. */
  signedAt: string;
  /** ISO date — when performance began; null when the source did not say. */
  popStartAt: string | null;
  completionAt: string | null;
  placeOfPerformance: OpportunityPlace | null;
  /** ISO 8601. */
  fetchedAt: string;
}

export interface AwardsQuery {
  naics?: string;
  psc?: string;
  /** Substring of the agency path. */
  agency?: string;
  solicitationNumber?: string;
  awardeeUei?: string;
  /** ISO dates, inclusive, on `signedAt`. */
  from?: string;
  to?: string;
  source?: AwardSource;
  limit?: number;
  offset?: number;
}

/** Offers received, banded the way a bidder reads competition. */
export type OffersBand = 'one' | 'few' | 'many' | 'unknown';

export interface AwardeeShare {
  name: string;
  uei: string | null;
  count: number;
  total: number;
}

/** The stored awards a query matched, summarized deterministically. */
export interface AwardsSummary {
  count: number;
  total: number;
  median: number | null;
  offers: Record<OffersBand, number>;
  topAwardees: AwardeeShare[];
  setAsideMix: Record<string, number>;
  bySource: Record<AwardSource, number>;
}

/** `POST /awards/fetch`: which sources to spend on, for which codes and dates. */
export interface FetchAwardsRequest {
  naics: string[];
  psc?: string[];
  from: string;
  to: string;
  sources: AwardSource[];
}

export interface AwardsFetchSlice {
  source: AwardSource;
  /** The NAICS or PSC the slice asked for. */
  code: string;
  outcome: SliceOutcome;
  pages: number;
  received: number;
  inserted: number;
  updated: number;
  truncated: boolean;
  detail: string | null;
}

export interface FetchAwardsReport {
  slices: AwardsFetchSlice[];
  spent: number | null;
  budget: number;
}

export type ListAwardsResponse = ApiListResponse<Award>;
export type GetAwardsSummaryResponse = ApiResponse<AwardsSummary>;
export type FetchAwardsResponse = ApiResponse<FetchAwardsReport>;
