import {
  formatAmountRange,
  withFacetParams,
  type AgencyDirectory,
  type AgencyOutlook,
  type AgencyOutlookQuery,
  type AwardDetail,
  type FacetQuery,
  type GetAgenciesResponse,
  type GetAgencyOutlookResponse,
  type GetAwardDetailResponse,
  type GetSpendingBreakdownResponse,
  type GetSpendingHorizonResponse,
  type GetSpendingPrimesResponse,
  type GetSpendingPulseResponse,
  type GetSpendingReachResponse,
  type SpendingBreakdown,
  type SpendingBreakdownQuery,
  type SpendingHorizon,
  type SpendingHorizonQuery,
  type SpendingPrimes,
  type SpendingPrimesQuery,
  type SpendingPulse,
  type SpendingPulseQuery,
  type SpendingReach,
  type SpendingReachQuery,
} from '@sysdesign/contracts';
import { query as toQueryString, unwrap, type GetOptions } from '@sysdesign/web-kit';

import { encode, joined, request } from './request';

/** A scope on the wire: the code lists comma-joined and every facet in its one spelling. */
const scopeParams = <Q extends FacetQuery & { naics?: string[]; psc?: string[] }>(query: Q) => {
  const { naics, psc, ...rest } = withFacetParams(query);
  return { naics: joined(naics), psc: joined(psc), ...rest };
};

/**
 * The spending side of the service: the lenses over one scope, one award's
 * record and the agency directory, free, answered from the day's snapshot
 * when there is one.
 */
export const spendingApi = {
  async getSpendingPulse(
    query: SpendingPulseQuery = {},
    opts: GetOptions = {},
  ): Promise<SpendingPulse> {
    return unwrap(
      await request<GetSpendingPulseResponse>(
        `/spending/pulse${toQueryString({ ...scopeParams(query) })}`,
        opts,
      ),
    );
  },
  async getSpendingBreakdown(
    query: SpendingBreakdownQuery,
    opts: GetOptions = {},
  ): Promise<SpendingBreakdown> {
    return unwrap(
      await request<GetSpendingBreakdownResponse>(
        `/spending/breakdown${toQueryString({ ...scopeParams(query) })}`,
        opts,
      ),
    );
  },
  async getSpendingHorizon(
    query: SpendingHorizonQuery = {},
    opts: GetOptions = {},
  ): Promise<SpendingHorizon> {
    return unwrap(
      await request<GetSpendingHorizonResponse>(
        `/spending/horizon${toQueryString({ ...scopeParams(query) })}`,
        opts,
      ),
    );
  },
  async getSpendingReach(
    { lanes, ...query }: SpendingReachQuery,
    opts: GetOptions = {},
  ): Promise<SpendingReach> {
    return unwrap(
      await request<GetSpendingReachResponse>(
        `/spending/reach${toQueryString({ ...scopeParams(query), lanes: joined(lanes) })}`,
        opts,
      ),
    );
  },
  async getSpendingPrimes(
    { band, ...query }: SpendingPrimesQuery,
    opts: GetOptions = {},
  ): Promise<SpendingPrimes> {
    return unwrap(
      await request<GetSpendingPrimesResponse>(
        `/spending/primes${toQueryString({
          ...scopeParams(query),
          band: band === undefined ? undefined : formatAmountRange(band),
        })}`,
        opts,
      ),
    );
  },
  async getAward(externalId: string, opts: GetOptions = {}): Promise<AwardDetail> {
    return unwrap(
      await request<GetAwardDetailResponse>(`/spending/awards/${encode(externalId)}`, opts),
    );
  },
  async listAgencies(opts: GetOptions = {}): Promise<AgencyDirectory> {
    return unwrap(await request<GetAgenciesResponse>('/spending/agencies', opts));
  },
  async getAgencyOutlook(
    toptierCode: string,
    query: AgencyOutlookQuery = {},
    opts: GetOptions = {},
  ): Promise<AgencyOutlook> {
    return unwrap(
      await request<GetAgencyOutlookResponse>(
        `/spending/agencies/${encode(toptierCode)}${toQueryString({ ...query })}`,
        opts,
      ),
    );
  },
};
