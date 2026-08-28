import type { APIRequestContext, APIResponse } from '@playwright/test';
import type {
  DesignSessionDto,
  ExperienceProfileDto,
  PromptDto,
  SaveStarStoryRequest,
  StarStoryDto,
} from '@sysdesign/contracts';

/**
 * Thin typed helpers over the real API, for arranging state the test under
 * way is not about. A canvas spec needs a practice session to exist; driving
 * the prompt-generation UI to get one would make every canvas failure look
 * like a generation failure. The specs that are about generation still drive
 * the UI.
 */

export const API_URL = process.env['API_URL'] ?? 'http://localhost:3000/api';

async function unwrap<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${response.url()} → ${response.status()}: ${await response.text()}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

export async function listExperiences(request: APIRequestContext): Promise<ExperienceProfileDto[]> {
  return unwrap(await request.get(`${API_URL}/experiences`));
}

/** The seeded flash-sale experience the generation specs anchor on. */
export const TICKETING_COMPANY = 'Ticketing & events platform';

export async function ticketingExperience(
  request: APIRequestContext,
): Promise<ExperienceProfileDto> {
  const experiences = await listExperiences(request);
  const ticketing = experiences.find((experience) => experience.companyLabel === TICKETING_COMPANY);
  if (!ticketing) {
    throw new Error(
      `Seed data is missing the "${TICKETING_COMPANY}" experience — run \`pnpm db:seed\`.`,
    );
  }
  return ticketing;
}

export async function generatePrompt(
  request: APIRequestContext,
  experienceId?: string,
): Promise<PromptDto> {
  const id = experienceId ?? (await ticketingExperience(request)).id;
  return unwrap(await request.post(`${API_URL}/prompts/generate`, { data: { experienceId: id } }));
}

export async function getPrompt(request: APIRequestContext, promptId: string): Promise<PromptDto> {
  return unwrap(await request.get(`${API_URL}/prompts/${promptId}`));
}

export async function createPracticeSession(
  request: APIRequestContext,
): Promise<{ prompt: PromptDto; session: DesignSessionDto }> {
  const prompt = await generatePrompt(request);
  const session = await unwrap<DesignSessionDto>(
    await request.post(`${API_URL}/sessions`, { data: { promptId: prompt.id } }),
  );
  return { prompt, session };
}

export async function createStory(
  request: APIRequestContext,
  payload: SaveStarStoryRequest,
): Promise<StarStoryDto> {
  return unwrap(await request.post(`${API_URL}/star-stories`, { data: payload }));
}
