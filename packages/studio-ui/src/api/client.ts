import type {
  ApiListResponse,
  BriefSuggestionsDto,
  BriefSuggestionsRequest,
  InterfaceSuggestionsDto,
  InterfaceSuggestionsRequest,
  ApiResponse,
  CreateSessionRequest,
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  EvaluationDto,
  ExperienceProfileDto,
  GeneratePromptRequest,
  ImprovementRunDto,
  LlmAvailabilityDto,
  ListPromptsQuery,
  ListSessionsQuery,
  ListStarStoriesQuery,
  PromptDto,
  SaveStarStoryRequest,
  StarStoryDto,
  StartImprovementRunRequest,
  SubmitRevisionRequest,
  UpdatePromptRequest,
  UpdateSessionRequest,
} from '@sysdesign/contracts';
import { createRequest, query, unwrap, type GetOptions } from '@sysdesign/web-kit';

/**
 * The one HTTP boundary. Components never call `fetch`; they call these
 * typed methods, which unwrap the `{ data }` / `{ data, meta }` envelopes so
 * the rest of the app works in plain DTOs (lists keep `meta` for paging).
 * The request core itself is `@sysdesign/web-kit`; only the base URL and the
 * endpoints are this app's.
 */

const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000/api';
const request = createRequest(BASE_URL);

export const api = {
  // Experiences ------------------------------------------------------------
  async listExperiences(opts: GetOptions = {}): Promise<ApiListResponse<ExperienceProfileDto>> {
    return request<ApiListResponse<ExperienceProfileDto>>('/experiences', opts);
  },

  async getExperience(id: string, opts: GetOptions = {}): Promise<ExperienceProfileDto> {
    return unwrap(await request<ApiResponse<ExperienceProfileDto>>(`/experiences/${id}`, opts));
  },

  // Prompts ----------------------------------------------------------------
  async generatePrompt(body: GeneratePromptRequest): Promise<PromptDto> {
    return unwrap(
      await request<ApiResponse<PromptDto>>('/prompts/generate', { method: 'POST', body }),
    );
  },

  async regeneratePrompt(id: string): Promise<PromptDto> {
    return unwrap(
      await request<ApiResponse<PromptDto>>(`/prompts/${id}/regenerate`, { method: 'POST' }),
    );
  },

  async listPrompts(
    params: ListPromptsQuery = {},
    opts: GetOptions = {},
  ): Promise<ApiListResponse<PromptDto>> {
    return request<ApiListResponse<PromptDto>>(`/prompts${query({ ...params })}`, opts);
  },

  async getPrompt(id: string, opts: GetOptions = {}): Promise<PromptDto> {
    return unwrap(await request<ApiResponse<PromptDto>>(`/prompts/${id}`, opts));
  },

  async updatePrompt(id: string, body: UpdatePromptRequest): Promise<PromptDto> {
    return unwrap(
      await request<ApiResponse<PromptDto>>(`/prompts/${id}`, { method: 'PATCH', body }),
    );
  },

  // Sessions ---------------------------------------------------------------
  async createSession(body: CreateSessionRequest): Promise<DesignSessionDto> {
    return unwrap(
      await request<ApiResponse<DesignSessionDto>>('/sessions', { method: 'POST', body }),
    );
  },

  async listSessions(
    params: ListSessionsQuery = {},
    opts: GetOptions = {},
  ): Promise<ApiListResponse<DesignSessionDto>> {
    return request<ApiListResponse<DesignSessionDto>>(`/sessions${query({ ...params })}`, opts);
  },

  async getSession(id: string, opts: GetOptions = {}): Promise<DesignSessionDto> {
    return unwrap(await request<ApiResponse<DesignSessionDto>>(`/sessions/${id}`, opts));
  },

  async updateSession(id: string, body: UpdateSessionRequest): Promise<DesignSessionDto> {
    return unwrap(
      await request<ApiResponse<DesignSessionDto>>(`/sessions/${id}`, {
        method: 'PATCH',
        body,
      }),
    );
  },

  // Revisions --------------------------------------------------------------
  async submitRevision(sessionId: string, body: SubmitRevisionRequest): Promise<DesignRevisionDto> {
    return unwrap(
      await request<ApiResponse<DesignRevisionDto>>(`/sessions/${sessionId}/revisions`, {
        method: 'POST',
        body,
      }),
    );
  },

  /**
   * Candidate bindings for the draft in the body — the canvas being worked on,
   * not the last one submitted. Cancellable: the author can switch tabs or edit
   * the diagram out from under a request that is still in flight.
   */
  async briefSuggestions(
    sessionId: string,
    body: BriefSuggestionsRequest,
    opts: GetOptions = {},
  ): Promise<BriefSuggestionsDto> {
    return unwrap(
      await request<ApiResponse<BriefSuggestionsDto>>(`/sessions/${sessionId}/brief-suggestions`, {
        method: 'POST',
        body,
        ...opts,
      }),
    );
  },

  async interfaceSuggestions(
    sessionId: string,
    body: InterfaceSuggestionsRequest,
    opts: GetOptions = {},
  ): Promise<InterfaceSuggestionsDto> {
    return unwrap(
      await request<ApiResponse<InterfaceSuggestionsDto>>(
        `/sessions/${sessionId}/interface-suggestions`,
        { method: 'POST', body, ...opts },
      ),
    );
  },

  async listRevisions(
    sessionId: string,
    opts: GetOptions = {},
  ): Promise<ApiListResponse<DesignRevisionSummaryDto>> {
    return request<ApiListResponse<DesignRevisionSummaryDto>>(
      `/sessions/${sessionId}/revisions`,
      opts,
    );
  },

  async getRevision(id: string, opts: GetOptions = {}): Promise<DesignRevisionDto> {
    return unwrap(await request<ApiResponse<DesignRevisionDto>>(`/revisions/${id}`, opts));
  },

  async getEvaluation(revisionId: string, opts: GetOptions = {}): Promise<EvaluationDto> {
    return unwrap(
      await request<ApiResponse<EvaluationDto>>(`/revisions/${revisionId}/evaluation`, opts),
    );
  },

  async retryEvaluation(revisionId: string): Promise<EvaluationDto> {
    return unwrap(
      await request<ApiResponse<EvaluationDto>>(`/revisions/${revisionId}/evaluation/retry`, {
        method: 'POST',
      }),
    );
  },

  // Improvement runs (the AI coach) -----------------------------------------
  async improverAvailability(opts: GetOptions = {}): Promise<LlmAvailabilityDto> {
    return unwrap(
      await request<ApiResponse<LlmAvailabilityDto>>('/improvement-runs/availability', opts),
    );
  },

  /** Submits the current canvas as a base revision and queues the run (202). */
  async startImprovementRun(
    sessionId: string,
    body: StartImprovementRunRequest,
  ): Promise<ImprovementRunDto> {
    return unwrap(
      await request<ApiResponse<ImprovementRunDto>>(`/sessions/${sessionId}/improvement-runs`, {
        method: 'POST',
        body,
      }),
    );
  },

  async getImprovementRun(id: string, opts: GetOptions = {}): Promise<ImprovementRunDto> {
    return unwrap(await request<ApiResponse<ImprovementRunDto>>(`/improvement-runs/${id}`, opts));
  },

  async cancelImprovementRun(id: string): Promise<ImprovementRunDto> {
    return unwrap(
      await request<ApiResponse<ImprovementRunDto>>(`/improvement-runs/${id}/cancel`, {
        method: 'POST',
      }),
    );
  },

  // STAR stories -----------------------------------------------------------
  async createStory(body: SaveStarStoryRequest): Promise<StarStoryDto> {
    return unwrap(
      await request<ApiResponse<StarStoryDto>>('/star-stories', { method: 'POST', body }),
    );
  },

  async listStories(
    params: ListStarStoriesQuery = {},
    opts: GetOptions = {},
  ): Promise<ApiListResponse<StarStoryDto>> {
    return request<ApiListResponse<StarStoryDto>>(`/star-stories${query({ ...params })}`, opts);
  },

  async getStory(id: string, opts: GetOptions = {}): Promise<StarStoryDto> {
    return unwrap(await request<ApiResponse<StarStoryDto>>(`/star-stories/${id}`, opts));
  },

  async updateStory(id: string, body: SaveStarStoryRequest): Promise<StarStoryDto> {
    return unwrap(
      await request<ApiResponse<StarStoryDto>>(`/star-stories/${id}`, { method: 'PUT', body }),
    );
  },

  async deleteStory(id: string): Promise<void> {
    await request<void>(`/star-stories/${id}`, { method: 'DELETE' });
  },
};
