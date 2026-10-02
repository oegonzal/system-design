import type { APIRequestContext, APIResponse } from '@playwright/test';
import type {
  AuthorPromptRequest,
  CoachingRunSummaryDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  ExperienceProfileDto,
  PromptDto,
  PromptGenerationDto,
  PromptStatus,
  QualityRunStartedDto,
  SaveStarStoryRequest,
  StarStoryDto,
} from '@sysdesign/contracts';

import { API_URL } from './stack';

/**
 * Thin typed helpers over the real API, for arranging state the test under
 * way is not about. A canvas spec needs a practice session to exist; driving
 * the prompt composer to get one would make every canvas failure look like
 * an authoring failure. The specs that are about authoring, importing and
 * generating still drive the UI.
 *
 * Every rubric here is the stub grader's: one criterion per bullet or table
 * row of the markdown, kinded by section, ids `c1…cN` in document order.
 */

async function unwrap<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${response.url()} → ${response.status()}: ${await response.text()}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

// ---- experiences ------------------------------------------------------------

export async function listExperiences(request: APIRequestContext): Promise<ExperienceProfileDto[]> {
  return unwrap(await request.get(`${API_URL}/experiences`));
}

/** The seeded flash-sale experience the generation specs anchor on. */
export const TICKETING_COMPANY = 'Ticketing & events platform';

export async function ticketingExperience(
  request: APIRequestContext,
): Promise<ExperienceProfileDto> {
  const experiences = await listExperiences(request);
  const found = experiences.find((experience) => experience.companyLabel === TICKETING_COMPANY);
  if (!found) {
    throw new Error(
      `Seed data is missing the "${TICKETING_COMPANY}" experience — run \`pnpm db:seed\`.`,
    );
  }
  return found;
}

// ---- prompts ----------------------------------------------------------------

export const AUTHORED_TITLE = 'Serve a unified order history';

/**
 * Two functional bullets, one quality row, one scale row, one constraint:
 * `c1…c5` under the stub grader, in that order. Every binding, narration and
 * criterion-result assertion in the suite is written against these ids.
 */
export const AUTHORED_MARKDOWN = [
  `# ${AUTHORED_TITLE}`,
  '',
  '## Scenario',
  '',
  'You run the order-history service for a retailer that sells online and in stores.',
  '',
  '## Functional requirements',
  '',
  "1. Return a customer's past orders newest first, with line items.",
  '2. Ingest online orders as the storefront pushes them by webhook.',
  '',
  '## Non-functional requirements',
  '',
  '| Kind | Requirement | Target |',
  '| --- | --- | --- |',
  '| latency | order-history reads | p99 ≤ 300 ms |',
  '',
  '## Scale targets',
  '',
  '| Metric | Target |',
  '| --- | --- |',
  '| peak read rate | 2,000 requests/s |',
  '',
  '## Constraints',
  '',
  '- The point-of-sale system only answers polling.',
  '',
].join('\n');

/** The authored rubric, grouped the way the prompt pane groups it. */
export const AUTHORED_CRITERIA_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  functional: ['c1', 'c2'],
  non_functional: ['c3'],
  scale: ['c4'],
  constraint: ['c5'],
};

export const AUTHORED_CRITERIA_IDS: readonly string[] = ['c1', 'c2', 'c3', 'c4', 'c5'];

export async function authorPrompt(
  request: APIRequestContext,
  overrides: Partial<AuthorPromptRequest> = {},
): Promise<PromptDto> {
  const body: AuthorPromptRequest = {
    title: AUTHORED_TITLE,
    markdown: AUTHORED_MARKDOWN,
    ...overrides,
  };
  return unwrap(await request.post(`${API_URL}/prompts`, { data: body }));
}

export async function importPrompt(
  request: APIRequestContext,
  libraryId: string,
): Promise<PromptDto> {
  return unwrap(await request.post(`${API_URL}/prompts/import`, { data: { libraryId } }));
}

/** The stub completes a run in well under a second; a cold API deserves headroom. */
const GENERATION_TIMEOUT_MS = 30_000;
const GENERATION_POLL_MS = 250;

/**
 * Generate through the prompt pipeline the way the UI does: start the run,
 * then poll `GET /prompts/generate/:runId` until the studio has claimed the
 * draft as a prompt.
 */
export async function generatePrompt(
  request: APIRequestContext,
  experienceId?: string,
): Promise<PromptDto> {
  const id = experienceId ?? (await ticketingExperience(request)).id;
  const started = await unwrap<QualityRunStartedDto>(
    await request.post(`${API_URL}/prompts/generate`, { data: { experienceId: id } }),
  );
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  for (;;) {
    const generation = await unwrap<PromptGenerationDto>(
      await request.get(`${API_URL}/prompts/generate/${encodeURIComponent(started.runId)}`),
    );
    if (generation.status === 'complete' && generation.prompt) return generation.prompt;
    if (generation.status !== 'running') {
      throw new Error(
        `prompt generation ${started.runId} ${generation.status}: ${generation.error}`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `prompt generation ${started.runId} still running after ${GENERATION_TIMEOUT_MS} ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_MS));
  }
}

export async function getPrompt(request: APIRequestContext, promptId: string): Promise<PromptDto> {
  return unwrap(await request.get(`${API_URL}/prompts/${promptId}`));
}

/** Re-derive the rubric; 409 once a session cites its ids. */
export async function derivePromptCriteria(
  request: APIRequestContext,
  promptId: string,
): Promise<PromptDto> {
  return unwrap(await request.post(`${API_URL}/prompts/${promptId}/criteria`));
}

export async function setPromptStatus(
  request: APIRequestContext,
  promptId: string,
  status: PromptStatus,
): Promise<PromptDto> {
  return unwrap(await request.patch(`${API_URL}/prompts/${promptId}`, { data: { status } }));
}

/** Retire a prompt; its sessions stay readable, and the studio refuses new work on them. */
export const archivePrompt = (request: APIRequestContext, promptId: string): Promise<PromptDto> =>
  setPromptStatus(request, promptId, 'archived');

export const reactivatePrompt = (
  request: APIRequestContext,
  promptId: string,
): Promise<PromptDto> => setPromptStatus(request, promptId, 'active');

// ---- sessions ---------------------------------------------------------------

/** A session on the given prompt, or on a freshly authored one (`c1…c5`). */
export async function createPracticeSession(
  request: APIRequestContext,
  prompt?: PromptDto,
): Promise<{ prompt: PromptDto; session: DesignSessionDto }> {
  const target = prompt ?? (await authorPrompt(request));
  const session = await unwrap<DesignSessionDto>(
    await request.post(`${API_URL}/sessions`, { data: { promptId: target.id } }),
  );
  return { prompt: target, session };
}

export async function getSession(
  request: APIRequestContext,
  sessionId: string,
): Promise<DesignSessionDto> {
  return unwrap(await request.get(`${API_URL}/sessions/${sessionId}`));
}

/** Every revision of a session, newest first, as the timeline lists them. */
export async function listRevisions(
  request: APIRequestContext,
  sessionId: string,
): Promise<DesignRevisionSummaryDto[]> {
  return unwrap(await request.get(`${API_URL}/sessions/${sessionId}/revisions`));
}

/** Every coaching run of a session, newest first — what a reloaded workspace resumes polling. */
export async function coachingRuns(
  request: APIRequestContext,
  sessionId: string,
): Promise<CoachingRunSummaryDto[]> {
  return unwrap(await request.get(`${API_URL}/sessions/${sessionId}/improve`));
}

// ---- stories ----------------------------------------------------------------

export async function createStory(
  request: APIRequestContext,
  payload: SaveStarStoryRequest,
): Promise<StarStoryDto> {
  return unwrap(await request.post(`${API_URL}/star-stories`, { data: payload }));
}
