import type {
  GetPromptLibraryDocumentResponse,
  GetQualityRunResponse,
  ListPipelinesResponse,
  ListPromptLibraryResponse,
  ListQualityRunsQuery,
  ListQualityRunsResponse,
  PipelineSummary,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartQualityRunRequest,
  StartQualityRunResponse,
} from '@sysdesign/contracts';
import { createRequest, query as toQueryString, unwrap, type GetOptions } from '@sysdesign/web-kit';

/**
 * The one HTTP boundary to the quality-loop service. Single resources come
 * back unwrapped; `listRuns` keeps its envelope, since the list's `meta` is
 * part of the answer.
 */

const BASE_URL = process.env['NEXT_PUBLIC_QUALITY_LOOP_URL'] ?? 'http://localhost:3003';
const request = createRequest(BASE_URL);

export const api = {
  async listPipelines(opts: GetOptions = {}): Promise<PipelineSummary[]> {
    return unwrap(await request<ListPipelinesResponse>('/pipelines', opts));
  },

  async listPrompts(opts: GetOptions = {}): Promise<PromptLibraryEntryDto[]> {
    return unwrap(await request<ListPromptLibraryResponse>('/prompts', opts));
  },

  async getPrompt(id: string, opts: GetOptions = {}): Promise<PromptLibraryDocumentDto> {
    return unwrap(
      await request<GetPromptLibraryDocumentResponse>(`/prompts/${encodeURIComponent(id)}`, opts),
    );
  },

  async startRun(body: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    return unwrap(await request<StartQualityRunResponse>('/runs', { method: 'POST', body }));
  },

  async listRuns(
    query: ListQualityRunsQuery = {},
    opts: GetOptions = {},
  ): Promise<ListQualityRunsResponse> {
    return request<ListQualityRunsResponse>(`/runs${toQueryString({ ...query })}`, opts);
  },

  async getRun(runId: string, opts: GetOptions = {}): Promise<QualityRunDto> {
    return unwrap(await request<GetQualityRunResponse>(`/runs/${encodeURIComponent(runId)}`, opts));
  },
};
