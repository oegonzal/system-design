import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  STORY_MAX_TAGS,
  STORY_SECTION_MAX_LENGTH,
  STORY_TAG_MAX_LENGTH,
  STORY_TITLE_MAX_LENGTH,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** Shared by POST (create) and PUT (full replace); bounded by the column widths so Postgres never has to refuse. */
export const saveStarStorySchema = z.strictObject({
  title: z.string().max(STORY_TITLE_MAX_LENGTH),
  situation: z.string().max(STORY_SECTION_MAX_LENGTH),
  task: z.string().max(STORY_SECTION_MAX_LENGTH),
  action: z.string().max(STORY_SECTION_MAX_LENGTH),
  result: z.string().max(STORY_SECTION_MAX_LENGTH),
  tags: z.array(z.string().max(STORY_TAG_MAX_LENGTH)).max(STORY_MAX_TAGS),
  promptId: z.uuid().optional(),
  experienceId: z.uuid().optional(),
});

export const listStarStoriesQuerySchema = z.strictObject({
  ...pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
  /** Case-insensitive contains over title, situation and result. */
  search: z.string().max(STORY_SECTION_MAX_LENGTH).optional(),
  /** Exact tag membership — a term longer than a tag can never match one. */
  tag: z.string().max(STORY_TAG_MAX_LENGTH).optional(),
  promptId: z.uuid().optional(),
  experienceId: z.uuid().optional(),
});
export type ListStarStoriesQueryInput = z.infer<typeof listStarStoriesQuerySchema>;
