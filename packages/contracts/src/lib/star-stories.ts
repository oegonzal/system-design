import { z } from 'zod';

import { bound, bounded, type Bound } from './bounds';
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

export const STORY_TITLE_BOUND = bound(120);
export const STORY_SECTION_BOUND = bound(4000);
export const STORY_TAG_BOUND = bound(40);
export const STORY_TAGS_BOUND = bound(12, 'list');

/** Trimmed, then required and bounded: whitespace alone is not a title, a section or a tag. */
const filled = (b: Bound) => bounded.text(b, { trim: true, min: 1 });

/**
 * What a story must be to be saved — one rule for the API, which refuses
 * anything else with every offending path, and for the form, which says so
 * before the request. A title and all four STAR sections are required, tags
 * are bounded in length and count, and every value is stored trimmed. The
 * columns are `text`, so only the declared bounds limit them and Postgres
 * never has to refuse. Used by both POST (create) and PUT (full replace).
 */
export const saveStarStorySchema = z.strictObject({
  title: filled(STORY_TITLE_BOUND),
  situation: filled(STORY_SECTION_BOUND),
  task: filled(STORY_SECTION_BOUND),
  action: filled(STORY_SECTION_BOUND),
  result: filled(STORY_SECTION_BOUND),
  tags: bounded.list(STORY_TAGS_BOUND, filled(STORY_TAG_BOUND)),
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
