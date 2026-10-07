import type { ApiListResponse, ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';

/**
 * A professional experience the practice prompts are drawn from. Seeded
 * reference data only — the app never writes experiences. Everything a prompt
 * needs is in the prose: the summary, the stack and the highlights (which
 * carry the numbers) are rendered as the goal the prompt pipeline writes from.
 */
export interface ExperienceProfileDto {
  id: Uuid;
  slug: string;
  companyLabel: string;
  title: string;
  summary: string;
  techStack: string[];
  highlights: string[];
  createdAt: IsoDateString;
}

export type ListExperiencesResponse = ApiListResponse<ExperienceProfileDto>;
export type GetExperienceResponse = ApiResponse<ExperienceProfileDto>;
