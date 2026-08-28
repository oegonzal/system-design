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

/** Used by both POST (create) and PUT (full replace). */
export interface SaveStarStoryRequest {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  promptId?: Uuid;
  experienceId?: Uuid;
}

export interface ListStarStoriesQuery {
  /** Case-insensitive match over title, situation and result. */
  search?: string;
  tag?: string;
  promptId?: Uuid;
  experienceId?: Uuid;
  limit?: number;
  offset?: number;
}

export const STORY_TITLE_MAX_LENGTH = 120;
export const STORY_SECTION_MAX_LENGTH = 4000;
export const STORY_TAG_MAX_LENGTH = 40;
export const STORY_MAX_TAGS = 12;

export type ListStarStoriesResponse = ApiListResponse<StarStoryDto>;
export type GetStarStoryResponse = ApiResponse<StarStoryDto>;
