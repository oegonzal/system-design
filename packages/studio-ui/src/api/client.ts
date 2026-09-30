import type {
  ApiListResponse,
  ApiResponse,
  AuthorPromptRequest,
  CreateSessionRequest,
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  EvaluationDto,
  ExperienceProfileDto,
  GeneratePromptRequest,
  ImportPromptRequest,
  ImproveRunDto,
  ListPromptsQuery,
  ListSessionsQuery,
  ListStarStoriesQuery,
  LlmAvailabilityDto,
  PromptDto,
  PromptGenerationDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunStartedDto,
  SaveStarStoryRequest,
  StarStoryDto,
  StartImproveDto,
  StartImproveRequest,
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

/**
 * A library id is a path in the quality loop's prompt folder (`a/b.md`), so
 * each segment is encoded on its own — encoding the slash would turn one
 * document into a name the proxy route never matches.
 */
function encodeLibraryId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

export const api = {
  // Experiences ------------------------------------------------------------
  async listExperiences(opts: GetOptions = {}): Promise<ApiListResponse<ExperienceProfileDto>> {
    return request<ApiListResponse<ExperienceProfileDto>>('/experiences', opts);
  },

  async getExperience(id: string, opts: GetOptions = {}): Promise<ExperienceProfileDto> {
    return unwrap(await request<ApiResponse<ExperienceProfileDto>>(`/experiences/${id}`, opts));
  },

  // Prompts ----------------------------------------------------------------
  async listPromptLibrary(opts: GetOptions = {}): Promise<PromptLibraryEntryDto[]> {
    return unwrap(await request<ApiResponse<PromptLibraryEntryDto[]>>('/prompts/library', opts));
  },

  async getPromptLibraryDocument(
    id: string,
    opts: GetOptions = {},
  ): Promise<PromptLibraryDocumentDto> {
    return unwrap(
      await request<ApiResponse<PromptLibraryDocumentDto>>(
        `/prompts/library/${encodeLibraryId(id)}`,
        opts,
      ),
    );
  },

  async authorPrompt(body: AuthorPromptRequest): Promise<PromptDto> {
    return unwrap(await request<ApiResponse<PromptDto>>('/prompts', { method: 'POST', body }));
  },

  async importPrompt(body: ImportPromptRequest): Promise<PromptDto> {
    return unwrap(
      await request<ApiResponse<PromptDto>>('/prompts/import', { method: 'POST', body }),
    );
  },

  /** 202: the draft is written by a background run; poll `getPromptGeneration`. */
  async startPromptGeneration(body: GeneratePromptRequest): Promise<QualityRunStartedDto> {
    return unwrap(
      await request<ApiResponse<QualityRunStartedDto>>('/prompts/generate', {
        method: 'POST',
        body,
      }),
    );
  },

  async getPromptGeneration(runId: string, opts: GetOptions = {}): Promise<PromptGenerationDto> {
    return unwrap(
      await request<ApiResponse<PromptGenerationDto>>(
        `/prompts/generate/${encodeURIComponent(runId)}`,
        opts,
      ),
    );
  },

  /** Re-derive the rubric. 502/503 when the grader is unavailable; 409 once sessions exist. */
  async derivePromptCriteria(id: string, opts: GetOptions = {}): Promise<PromptDto> {
    return unwrap(
      await request<ApiResponse<PromptDto>>(`/prompts/${id}/criteria`, {
        method: 'POST',
        ...opts,
      }),
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

  /** The revision's grade — one iteration of one quality-loop run; poll while `running`. */
  async getEvaluation(revisionId: string, opts: GetOptions = {}): Promise<EvaluationDto> {
    return unwrap(
      await request<ApiResponse<EvaluationDto>>(`/revisions/${revisionId}/evaluation`, opts),
    );
  },

  // Grading and the coach ---------------------------------------------------
  /** 503 when the grader is unreachable — callers treat a throw as unavailable. */
  async gradingAvailability(opts: GetOptions = {}): Promise<LlmAvailabilityDto> {
    return unwrap(await request<ApiResponse<LlmAvailabilityDto>>('/grading/availability', opts));
  },

  /** Persists the draft as a revision and starts the coach (202). */
  async startImprove(sessionId: string, body: StartImproveRequest): Promise<StartImproveDto> {
    return unwrap(
      await request<ApiResponse<StartImproveDto>>(`/sessions/${sessionId}/improve`, {
        method: 'POST',
        body,
      }),
    );
  },

  async getImprove(
    sessionId: string,
    runId: string,
    opts: GetOptions = {},
  ): Promise<ImproveRunDto> {
    return unwrap(
      await request<ApiResponse<ImproveRunDto>>(
        `/sessions/${sessionId}/improve/${encodeURIComponent(runId)}`,
        opts,
      ),
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
