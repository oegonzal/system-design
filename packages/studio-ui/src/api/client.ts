import type {
  ApiListResponse,
  BriefSuggestionsDto,
  BriefSuggestionsRequest,
  ApiResponse,
  CreateSessionRequest,
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  EvaluationDto,
  ExperienceProfileDto,
  GeneratePromptRequest,
  ImprovementRunDto,
  ImproverAvailabilityDto,
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

/**
 * The one HTTP boundary. Components never call `fetch`; they call these
 * typed methods, which unwrap the `{ data }` / `{ data, meta }` envelopes so
 * the rest of the app works in plain DTOs (lists keep `meta` for paging).
 */

const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000/api';

/**
 * A non-2xx response, carrying the parsed error body. Errors are Nest-shaped
 * (`{ statusCode, message }`, message possibly an array of validation
 * strings) — `message` here is already flattened for display.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(errorMessageFrom(status, body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function errorMessageFrom(status: number, body: unknown): string {
  if (body !== null && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message) && message.length > 0) return message.join('; ');
  }
  return `Request failed with status ${status}`;
}

/** Aborted fetches are lifecycle noise, not failures — callers branch on this. */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** The one place an unknown catch turns into copy a person can read. */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.length > 0 && !isAbortError(error)) {
    return error.message;
  }
  return fallback;
}

/** Builds `?a=1&b=two`, dropping undefined but keeping legitimate zeros. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

/**
 * Cancellation. Named for its first users — every GET — but a POST that a
 * component can outlive needs it just as much, and brief suggestions is the
 * first of those.
 */
export interface GetOptions {
  signal?: AbortSignal;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });

  if (!response.ok) {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    throw new ApiError(response.status, parsed);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const unwrap = <T>(envelope: ApiResponse<T>): T => envelope.data;

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
  async improverAvailability(opts: GetOptions = {}): Promise<ImproverAvailabilityDto> {
    return unwrap(
      await request<ApiResponse<ImproverAvailabilityDto>>('/improvement-runs/availability', opts),
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
