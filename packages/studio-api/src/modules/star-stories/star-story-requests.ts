import {
  STORY_MAX_TAGS,
  STORY_SECTION_MAX_LENGTH,
  STORY_TAG_MAX_LENGTH,
  STORY_TITLE_MAX_LENGTH,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { listQueryShape } from '../../common/list-query';

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
  ...listQueryShape,
  /** Case-insensitive contains over title, situation and result. */
  search: z.string().max(STORY_SECTION_MAX_LENGTH).optional(),
  /** Exact tag membership — a term longer than a tag can never match one. */
  tag: z.string().max(STORY_TAG_MAX_LENGTH).optional(),
  promptId: z.uuid().optional(),
  experienceId: z.uuid().optional(),
});
export type ListStarStoriesQueryInput = z.infer<typeof listStarStoriesQuerySchema>;
