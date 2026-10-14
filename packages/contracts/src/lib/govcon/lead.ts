import type { ApiResponse } from '../envelope';
import type { Opportunity } from './opportunity';
import type { LeadTier } from './vocab';

/** One factor's contribution: `points = 100 × weight × value`, one decimal; the traces sum to the score. */
export interface FactorTrace {
  id: string;
  value: number;
  weight: number;
  points: number;
  evidence: string[];
}

export interface Lead {
  opportunity: Opportunity;
  /** 0–100, one decimal; 0 when excluded. */
  score: number;
  tier: LeadTier | null;
  factors: FactorTrace[];
  excluded: { factor: string; reason: string } | null;
}

/** `GET /leads`: what was considered, what a gate removed, what the filters kept, one page of it. */
export interface LeadsReport {
  profile: string;
  /** Stored records the store-side filters admitted: active, open, biddable set-aside, no excluded type. */
  candidates: number;
  /** `MAX_CANDIDATES` cut the set short; narrow the filters to see the rest. */
  capped: boolean;
  excluded: number;
  /** Leads over the score and tier filters, before paging. */
  matching: number;
  leads: Lead[];
  limit: number;
  offset: number;
}

/** The query of `GET /leads`: the store-side filters, then the score cut, then the page. */
export interface ListLeadsQuery {
  profile?: string;
  minScore?: number;
  tier?: LeadTier;
  /** A NAICS code or family the primary code starts with (the store matches families; SAM.gov's `ncode` does not). */
  naics?: string;
  setAside?: string;
  /** Any of these notice types, by SAM.gov's label. */
  noticeTypes?: string[];
  /** Substring of the agency path. */
  agency?: string;
  /** Substring of the title or the solicitation number. */
  q?: string;
  /** Only notices whose deadline falls within this many days. */
  deadlineWithinDays?: number;
  limit?: number;
  offset?: number;
}

export type ListLeadsResponse = ApiResponse<LeadsReport>;
