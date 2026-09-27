import type {
  DescriptionResultDto,
  FetchDescriptionResponse,
  GetLeadResponse,
  GetSourceResponse,
  LeadDetailDto,
  LeadsReport,
  ListCallsQuery,
  ListLeadsQuery,
  ListLeadsResponse,
  ListProfilesResponse,
  ListSourceCallsResponse,
  PullReport,
  SearchProfile,
  SourceStatusDto,
  StartPullRequest,
  StartPullResponse,
} from '@sysdesign/contracts';
import { createRequest, query as toQueryString, unwrap, type GetOptions } from '@sysdesign/web-kit';

/**
 * The one HTTP boundary to the govcon service. Single resources come back
 * unwrapped; `listCalls` keeps its envelope, since the ledger's `meta` is part
 * of the answer. A pull and a description fetch are POSTs that finish before
 * they answer — the report or the outcome is the response.
 */

const BASE_URL = process.env['NEXT_PUBLIC_GOVCON_URL'] ?? 'http://localhost:3004';
const request = createRequest(BASE_URL);

export const api = {
  async listProfiles(opts: GetOptions = {}): Promise<SearchProfile[]> {
    return unwrap(await request<ListProfilesResponse>('/profiles', opts));
  },

  async getSource(opts: GetOptions = {}): Promise<SourceStatusDto> {
    return unwrap(await request<GetSourceResponse>('/source', opts));
  },

  async startPull(body: StartPullRequest): Promise<PullReport> {
    return unwrap(await request<StartPullResponse>('/pulls', { method: 'POST', body }));
  },

  async listLeads(query: ListLeadsQuery = {}, opts: GetOptions = {}): Promise<LeadsReport> {
    return unwrap(await request<ListLeadsResponse>(`/leads${toQueryString({ ...query })}`, opts));
  },

  async getOpportunity(
    noticeId: string,
    profile: string,
    opts: GetOptions = {},
  ): Promise<LeadDetailDto> {
    return unwrap(
      await request<GetLeadResponse>(
        `/opportunities/${encodeURIComponent(noticeId)}${toQueryString({ profile })}`,
        opts,
      ),
    );
  },

  async fetchDescription(noticeId: string): Promise<DescriptionResultDto> {
    return unwrap(
      await request<FetchDescriptionResponse>(
        `/opportunities/${encodeURIComponent(noticeId)}/description`,
        { method: 'POST', body: {} },
      ),
    );
  },

  async listCalls(
    query: ListCallsQuery = {},
    opts: GetOptions = {},
  ): Promise<ListSourceCallsResponse> {
    return request<ListSourceCallsResponse>(`/source/calls${toQueryString({ ...query })}`, opts);
  },
};
