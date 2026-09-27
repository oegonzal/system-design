import type { ApiResponse } from '../envelope';
import type { QueryFilter } from './query';

/**
 * The search profile as data: everything the pull plan and the scorer read
 * about one company. Prices are open maps wherever an external vocabulary
 * appears, so an unlisted set-aside or notice type is priced by the profile's
 * defaults and gates, never by code. The govcon package validates this shape
 * with a zod schema whose output is checked against these interfaces.
 */
export interface Interest {
  term: string;
  aliases: string[];
  /** How much a match is worth; matched weights add up and cap at 1. */
  weight: number;
}

export interface PullPolicy {
  /** The queries a pull runs, in priority order — one request each per page. */
  slices: QueryFilter[];
  pageSize: number;
  maxPagesPerSlice: number;
}

export interface DeadlineBand {
  maxDays: number;
  value: number;
}

export interface ScoringPolicy {
  /** One weight per factor id; they sum to 1. */
  weights: Record<string, number>;
  setAside: {
    /** Codes the company may bid on and how attractive each is; any other code excludes. */
    byCode: Record<string, number>;
    /** A notice with no set-aside: open competition. */
    unrestricted: number;
  };
  noticeType: {
    byType: Record<string, number>;
    default: number;
    /** Types that are never a lead, e.g. an award already made. */
    exclude: string[];
  };
  deadline: {
    /** Ascending by `maxDays`; the first band the days left fit takes it. */
    bands: DeadlineBand[];
    /** Further out than the last band. */
    beyond: number;
    /** No deadline stated. */
    none: number;
  };
  tiers: {
    high: number;
    medium: number;
  };
}

export interface SearchProfile {
  id: string;
  company: string;
  /** NAICS codes or families, 2–6 digits; a shorter code is the whole family. */
  naics: string[];
  /** PSC codes or families, 1–4 characters. */
  psc: string[];
  interests: Interest[];
  pull: PullPolicy;
  scoring: ScoringPolicy;
}

export type ListProfilesResponse = ApiResponse<SearchProfile[]>;
