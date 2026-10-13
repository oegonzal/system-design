import type { ApiResponse } from '../envelope';
import type { FactorId } from './vocab';

/**
 * The search profile as data: everything the scorer, the ranking and the
 * pull read about one company. Prices are open maps wherever an external
 * vocabulary appears, so an unlisted set-aside or notice type is priced by
 * the profile's defaults and gates, never by code; the factor weights are a
 * closed record, because the factors are this package's own. The govcon
 * package validates this shape with a zod schema whose output is checked
 * against these interfaces. What a pull searches for is not here: it is the
 * profile's saved searches flagged for the pull.
 */
export interface Interest {
  term: string;
  aliases: string[];
  /** How much a match is worth; matched weights add up and cap at 1. */
  weight: number;
}

export interface PullPolicy {
  /** Records per page, up to SAM.gov's ceiling. */
  pageSize: number;
  /** Pages per slice before the report says `truncated`. */
  maxPagesPerSlice: number;
}

/** A value for everything up to `maxDays` days; bands ascend and the first fit wins. */
export interface DayBand {
  maxDays: number;
  value: number;
}

export interface ScoringPolicy {
  /** One weight per factor; they sum to 1. A factor at 0 still traces. */
  weights: Record<FactorId, number>;
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
    bands: DayBand[];
    /** Further out than the last band. */
    beyond: number;
    /** No deadline stated. */
    none: number;
  };
  /** Stored awards in the same NAICS: `saturateAt` of them in the last `days` days is worth 1. */
  history: {
    days: number;
    saturateAt: number;
  };
  /** Days since the notice was posted, by band. */
  freshness: {
    bands: DayBand[];
    beyond: number;
  };
  tiers: {
    high: number;
    medium: number;
  };
}

/** What the daily spending warm alerts on, declared per profile. */
export interface AlertPolicy {
  /** An award in the profile's codes ending within this many days raises one alert; 0 raises none. */
  endingWithinDays: number;
  /** The fiscal period in progress obligating above every prior year's amount for that period. */
  pulseAboveBand: boolean;
}

/** What a profile alerts on until it says otherwise; a stored document from before the policy reads as this. */
export const DEFAULT_ALERT_POLICY: AlertPolicy = { endingWithinDays: 90, pulseAboveBand: true };

export interface SearchProfile {
  /** A slug: the path segment and the key everything else joins on. */
  id: string;
  company: string;
  /** The company's SAM.gov unique entity id, when registered. */
  entityUei: string | null;
  /** NAICS codes or families, 2–6 digits; a shorter code is the whole family. */
  naics: string[];
  /** PSC codes or families, 1–4 characters. */
  psc: string[];
  interests: Interest[];
  pull: PullPolicy;
  leads: {
    /** A ranking considers notices posted within this many days. */
    horizonDays: number;
  };
  scoring: ScoringPolicy;
  alerts: AlertPolicy;
}

/** A profile as stored: the document plus what the store knows about it. */
export interface StoredProfile extends SearchProfile {
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The document inside a stored profile — what an editor starts from and a save sends back. */
export const documentOf = ({
  isDefault: _isDefault,
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  ...document
}: StoredProfile): SearchProfile => document;

export type ListProfilesResponse = ApiResponse<StoredProfile[]>;
export type GetProfileResponse = ApiResponse<StoredProfile>;
export type SaveProfileResponse = ApiResponse<StoredProfile>;
