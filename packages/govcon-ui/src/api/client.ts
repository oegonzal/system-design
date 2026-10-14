import {
  type GetTargetResponse,
  type GetTargetSummaryResponse,
  type ListAlertsQuery,
  type ListAlertsResponse,
  type ListTargetsQuery,
  type ListTargetsResponse,
  type SaveTargetRequest,
  type SaveTargetResponse,
  type Target,
  type TargetKind,
  type TargetSummary,
  type ListSavedViewsResponse,
  type SavedView,
  type SaveSavedViewRequest,
  type SaveSavedViewResponse,
} from '@sysdesign/contracts';
import type {
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
  GetAwardsSummaryResponse,
  GetBidPipelineSummaryResponse,
  GetEntityResponse,
  GetNoticeResponse,
  GetProfileResponse,
  GetSourceResponse,
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
  SearchProfile,
  SourceStatus,
  StartPullRequest,
  StartPullResponse,
  StoredProfile,
} from '@sysdesign/contracts';
import { query as toQueryString, unwrap, type GetOptions } from '@sysdesign/web-kit';

import { encode, joined, request } from './request';
import { spendingApi } from './spending';

/**
 * The one HTTP boundary to the govcon service, one method per route. Single
 * resources come back unwrapped; lists keep their envelope, since `meta` is
 * part of the answer. Every POST that spends the budget finishes before it
 * answers — the report or the outcome is the response. The spending side
 * is its own module and is one object with the rest here.
 */
const targetPath = (kind: TargetKind, subject: string): string =>
  `/targets/${kind}/${encode(subject)}`;

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

  // The views a profile keeps: named addresses inside this client.
  async listViews(profileId: string, opts: GetOptions = {}): Promise<SavedView[]> {
    return unwrap(
      await request<ListSavedViewsResponse>(`/profiles/${encode(profileId)}/views`, opts),
    );
  },
  async saveView(profileId: string, body: SaveSavedViewRequest): Promise<SavedView> {
    return unwrap(
      await request<SaveSavedViewResponse>(`/profiles/${encode(profileId)}/views`, {
        method: 'PUT',
        body,
      }),
    );
  },
  async removeView(id: string): Promise<void> {
    await request<undefined>(`/views/${encode(id)}`, { method: 'DELETE' });
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
  async listLeads(
    { noticeTypes, ...query }: ListLeadsQuery = {},
    opts: GetOptions = {},
  ): Promise<LeadsReport> {
    return unwrap(
      await request<ListLeadsResponse>(
        `/leads${toQueryString({ ...query, noticeTypes: joined(noticeTypes) })}`,
        opts,
      ),
    );
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

  // Targets: the firms and awards pursued, each addressed by what it is about.
  async listTargets(
    query: ListTargetsQuery = {},
    opts: GetOptions = {},
  ): Promise<ListTargetsResponse> {
    return request<ListTargetsResponse>(`/targets${toQueryString({ ...query })}`, opts);
  },
  async getTargetSummary(opts: GetOptions = {}): Promise<TargetSummary> {
    return unwrap(await request<GetTargetSummaryResponse>('/targets/summary', opts));
  },
  /** Null when it is not tracked. */
  async getTarget(
    kind: TargetKind,
    subject: string,
    opts: GetOptions = {},
  ): Promise<Target | null> {
    return unwrap(await request<GetTargetResponse>(targetPath(kind, subject), opts));
  },
  async saveTarget(kind: TargetKind, subject: string, body: SaveTargetRequest): Promise<Target> {
    return unwrap(
      await request<SaveTargetResponse>(targetPath(kind, subject), { method: 'PUT', body }),
    );
  },
  async removeTarget(kind: TargetKind, subject: string): Promise<void> {
    await request<undefined>(targetPath(kind, subject), { method: 'DELETE' });
  },

  // Alerts: what the daily warm raised, newest first.
  async listAlerts(
    query: ListAlertsQuery = {},
    opts: GetOptions = {},
  ): Promise<ListAlertsResponse> {
    return request<ListAlertsResponse>(`/alerts${toQueryString({ ...query })}`, opts);
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

  ...spendingApi,

  // Registrants.
  /** The registrant as stored — null until it has been looked up. Never a request to SAM.gov. */
  async getEntity(uei: string, opts: GetOptions = {}): Promise<Entity | null> {
    return unwrap(await request<GetEntityResponse>(`/entities/${encode(uei)}`, opts));
  },
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
