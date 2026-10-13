import type {
  AgencyDirectory,
  AgencyOutlook,
  AgencyOutlookQuery,
  AwardsQuery,
  AwardsSummary,
  Bid,
  BidPipelineSummary,
  DescriptionFetch,
  Entity,
  EntityLookup,
  FetchAwardsReport,
  FetchAwardsRequest,
  FetchAwardsResponse,
  FetchDescriptionResponse,
  GetAgenciesResponse,
  GetAgencyOutlookResponse,
  GetAwardsSummaryResponse,
  GetBidPipelineSummaryResponse,
  GetEntityResponse,
  GetNoticeResponse,
  GetProfileResponse,
  GetSourceResponse,
  GetSpendingBreakdownResponse,
  GetSpendingHorizonResponse,
  GetSpendingPulseResponse,
  LeadsReport,
  ListAwardsResponse,
  ListCallsQuery,
  ListLeadsQuery,
  ListLeadsResponse,
  ListPipelineQuery,
  ListPipelineResponse,
  ListProfilesResponse,
  ListSavedSearchesResponse,
  ListSourceCallsResponse,
  LookupEntitiesRequest,
  LookupEntitiesResponse,
  NoticeDto,
  PullReport,
  RunSearchRequest,
  RunSearchResponse,
  SaveBidRequest,
  SaveBidResponse,
  SaveProfileResponse,
  SaveSavedSearchRequest,
  SaveSavedSearchResponse,
  SavedSearch,
  ScopeQuery,
  SearchProfile,
  SourceStatus,
  SpendingBreakdown,
  SpendingBreakdownQuery,
  SpendingHorizon,
  SpendingHorizonQuery,
  SpendingPulse,
  SpendingPulseQuery,
  StartPullRequest,
  StartPullResponse,
  StoredProfile,
} from '@sysdesign/contracts';
import { createRequest, query as toQueryString, unwrap, type GetOptions } from '@sysdesign/web-kit';

/**
 * The one HTTP boundary to the govcon service, one method per route. Single
 * resources come back unwrapped; lists keep their envelope, since `meta` is
 * part of the answer. Every POST that spends the budget finishes before it
 * answers — the report or the outcome is the response.
 */
const BASE_URL = process.env['NEXT_PUBLIC_GOVCON_URL'] ?? 'http://localhost:3004';
const request = createRequest(BASE_URL);
const encode = encodeURIComponent;

/** A scope on the wire: the code lists comma-joined, since a query string carries scalars; the server reads them back as lists. */
const scopeParams = <Q extends ScopeQuery>({ naics, psc, ...rest }: Q) => ({
  naics: naics && naics.length > 0 ? naics.join(',') : undefined,
  psc: psc && psc.length > 0 ? psc.join(',') : undefined,
  ...rest,
});

export const api = {
  // Profiles and their saved searches.
  async listProfiles(opts: GetOptions = {}): Promise<StoredProfile[]> {
    return unwrap(await request<ListProfilesResponse>('/profiles', opts));
  },
  async createProfile(document: SearchProfile): Promise<StoredProfile> {
    return unwrap(
      await request<SaveProfileResponse>('/profiles', { method: 'POST', body: document }),
    );
  },
  async updateProfile(id: string, document: SearchProfile): Promise<StoredProfile> {
    return unwrap(
      await request<SaveProfileResponse>(`/profiles/${encode(id)}`, {
        method: 'PUT',
        body: document,
      }),
    );
  },
  async deleteProfile(id: string): Promise<void> {
    await request<undefined>(`/profiles/${encode(id)}`, { method: 'DELETE' });
  },
  async setDefaultProfile(id: string): Promise<StoredProfile> {
    return unwrap(
      await request<GetProfileResponse>(`/profiles/${encode(id)}/default`, {
        method: 'POST',
        body: {},
      }),
    );
  },
  async listSearches(profileId: string, opts: GetOptions = {}): Promise<SavedSearch[]> {
    return unwrap(
      await request<ListSavedSearchesResponse>(`/profiles/${encode(profileId)}/searches`, opts),
    );
  },
  async createSearch(profileId: string, body: SaveSavedSearchRequest): Promise<SavedSearch> {
    return unwrap(
      await request<SaveSavedSearchResponse>(`/profiles/${encode(profileId)}/searches`, {
        method: 'POST',
        body,
      }),
    );
  },
  async updateSearch(id: string, body: SaveSavedSearchRequest): Promise<SavedSearch> {
    return unwrap(
      await request<SaveSavedSearchResponse>(`/searches/${encode(id)}`, { method: 'PUT', body }),
    );
  },
  async deleteSearch(id: string): Promise<void> {
    await request<undefined>(`/searches/${encode(id)}`, { method: 'DELETE' });
  },
  async runSearch(
    id: string,
    body: Pick<StartPullRequest, 'days' | 'from' | 'to'> = {},
  ): Promise<PullReport> {
    return unwrap(
      await request<RunSearchResponse>(`/searches/${encode(id)}/run`, { method: 'POST', body }),
    );
  },
  async runFilter(body: RunSearchRequest): Promise<PullReport> {
    return unwrap(await request<RunSearchResponse>('/searches/run', { method: 'POST', body }));
  },

  // The upstreams and the ledger.
  async getSource(opts: GetOptions = {}): Promise<SourceStatus> {
    return unwrap(await request<GetSourceResponse>('/source', opts));
  },
  async listCalls(
    query: ListCallsQuery = {},
    opts: GetOptions = {},
  ): Promise<ListSourceCallsResponse> {
    return request<ListSourceCallsResponse>(`/source/calls${toQueryString({ ...query })}`, opts);
  },

  // Pulls and leads.
  async startPull(body: StartPullRequest): Promise<PullReport> {
    return unwrap(await request<StartPullResponse>('/pulls', { method: 'POST', body }));
  },
  async listLeads(query: ListLeadsQuery = {}, opts: GetOptions = {}): Promise<LeadsReport> {
    return unwrap(await request<ListLeadsResponse>(`/leads${toQueryString({ ...query })}`, opts));
  },

  // One notice.
  async getNotice(noticeId: string, profile?: string, opts: GetOptions = {}): Promise<NoticeDto> {
    return unwrap(
      await request<GetNoticeResponse>(
        `/notices/${encode(noticeId)}${toQueryString({ profile })}`,
        opts,
      ),
    );
  },
  async fetchDescription(noticeId: string): Promise<DescriptionFetch> {
    return unwrap(
      await request<FetchDescriptionResponse>(`/notices/${encode(noticeId)}/description`, {
        method: 'POST',
        body: {},
      }),
    );
  },

  // Bids and the pipeline.
  async saveBid(noticeId: string, body: SaveBidRequest): Promise<Bid> {
    return unwrap(
      await request<SaveBidResponse>(`/notices/${encode(noticeId)}/bid`, { method: 'PUT', body }),
    );
  },
  async removeBid(noticeId: string): Promise<void> {
    await request<undefined>(`/notices/${encode(noticeId)}/bid`, { method: 'DELETE' });
  },
  async listPipeline(
    query: ListPipelineQuery = {},
    opts: GetOptions = {},
  ): Promise<ListPipelineResponse> {
    return request<ListPipelineResponse>(`/pipeline${toQueryString({ ...query })}`, opts);
  },
  async getPipelineSummary(opts: GetOptions = {}): Promise<BidPipelineSummary> {
    return unwrap(await request<GetBidPipelineSummaryResponse>('/pipeline/summary', opts));
  },

  // Awards.
  async listAwards(query: AwardsQuery = {}, opts: GetOptions = {}): Promise<ListAwardsResponse> {
    return request<ListAwardsResponse>(`/awards${toQueryString({ ...query })}`, opts);
  },
  async getAwardsSummary(
    query: Omit<AwardsQuery, 'limit' | 'offset'> = {},
    opts: GetOptions = {},
  ): Promise<AwardsSummary> {
    return unwrap(
      await request<GetAwardsSummaryResponse>(
        `/awards/summary${toQueryString({ ...query })}`,
        opts,
      ),
    );
  },
  async fetchAwards(body: FetchAwardsRequest): Promise<FetchAwardsReport> {
    return unwrap(await request<FetchAwardsResponse>('/awards/fetch', { method: 'POST', body }));
  },

  // Spending: four lenses and the agency directory, free, answered from the day's snapshot when there is one.
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

  // Registrants.
  async getOwnEntity(profile?: string, opts: GetOptions = {}): Promise<Entity | null> {
    return unwrap(
      await request<GetEntityResponse>(`/entities/own${toQueryString({ profile })}`, opts),
    );
  },
  async lookupEntities(body: LookupEntitiesRequest): Promise<EntityLookup> {
    return unwrap(
      await request<LookupEntitiesResponse>('/entities/lookup', { method: 'POST', body }),
    );
  },
};
