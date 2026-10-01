import { z } from 'zod';

import type { ApiListResponse, ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';

/**
 * The STAR repository: interview-ready stories about past production work,
 * optionally linked to the design prompt they answer and the experience they
 * come from.
 */
export interface StarStoryDto {
  id: Uuid;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  promptId: Uuid | null;
  experienceId: Uuid | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export const STORY_TITLE_MAX_LENGTH = 120;
export const STORY_SECTION_MAX_LENGTH = 4000;
export const STORY_TAG_MAX_LENGTH = 40;
export const STORY_MAX_TAGS = 12;

/** Trimmed, then required and bounded: whitespace alone is not a title, a section or a tag. */
const filled = (max: number) => z.string().trim().min(1).max(max);

/**
 * What a story must be to be saved — one rule for the API, which refuses
 * anything else with every offending path, and for the form, which says so
 * before the request. A title and all four STAR sections are required, tags
 * are bounded in length and count, and every value is stored trimmed. The
 * bounds are the column widths, so Postgres never has to refuse. Used by
 * both POST (create) and PUT (full replace).
 */
export const saveStarStorySchema = z.strictObject({
  title: filled(STORY_TITLE_MAX_LENGTH),
  situation: filled(STORY_SECTION_MAX_LENGTH),
  task: filled(STORY_SECTION_MAX_LENGTH),
  action: filled(STORY_SECTION_MAX_LENGTH),
  result: filled(STORY_SECTION_MAX_LENGTH),
  tags: z.array(filled(STORY_TAG_MAX_LENGTH)).max(STORY_MAX_TAGS),
  promptId: z.uuid().optional(),
  experienceId: z.uuid().optional(),
});

/** What a client sends; the API stores it as `saveStarStorySchema` parses it — trimmed. */
export type SaveStarStoryRequest = z.input<typeof saveStarStorySchema>;

export interface ListStarStoriesQuery {
  /** Case-insensitive match over title, situation and result. */
  search?: string;
  tag?: string;
  promptId?: Uuid;
  experienceId?: Uuid;
  limit?: number;
  offset?: number;
}

export type ListStarStoriesResponse = ApiListResponse<StarStoryDto>;
export type GetStarStoryResponse = ApiResponse<StarStoryDto>;
