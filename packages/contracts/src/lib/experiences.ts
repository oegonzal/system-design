import type { ApiListResponse, ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';

/**
 * Whose an experience is, as each one declares it. `own` is the subject's own
 * record — a role they held, a project they built — and the only origin an
 * export may state as theirs. `practice` is an example written to practise
 * on: prompts are drawn from it like any other, and no export states it as
 * the subject's.
 */
export const EXPERIENCE_ORIGINS = ['own', 'practice'] as const;
export type ExperienceOrigin = (typeof EXPERIENCE_ORIGINS)[number];

/**
 * A professional experience the practice prompts are drawn from. Seeded
 * reference data only — the app never writes experiences. Everything a prompt
 * needs is in the prose: the summary, the stack, the highlights and the
 * practice highlights after them are rendered as the goal the prompt pipeline
 * writes from.
 */
export interface ExperienceProfileDto {
  id: Uuid;
  slug: string;
  origin: ExperienceOrigin;
  companyLabel: string;
  title: string;
  summary: string;
  techStack: string[];
  highlights: string[];
  /**
   * Lines an `own` experience carries only so a prompt drawn from it has them
   * — a scale to size the design for, say. Not attested as the subject's, and
   * never exported as theirs.
   */
  practiceHighlights: string[];
  createdAt: IsoDateString;
}

export type ListExperiencesResponse = ApiListResponse<ExperienceProfileDto>;
export type GetExperienceResponse = ApiResponse<ExperienceProfileDto>;
