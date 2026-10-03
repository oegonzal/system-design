import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  STORY_SECTION_BOUND,
  STORY_TAG_BOUND,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** The list's query. POST and PUT validate with the contracts' `saveStarStorySchema`, verbatim — the rule the form applies too. */
export const listStarStoriesQuerySchema = z.strictObject({
  ...pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
  /** Case-insensitive contains over title, situation and result — a term longer than a stored section can never match one. */
  search: z.string().max(STORY_SECTION_BOUND.ceiling).optional(),
  /** Exact tag membership — a term longer than a stored tag, which may run to the ceiling, can never match one. */
  tag: z.string().max(STORY_TAG_BOUND.ceiling).optional(),
  promptId: z.uuid().optional(),
  experienceId: z.uuid().optional(),
});
export type ListStarStoriesQueryInput = z.infer<typeof listStarStoriesQuerySchema>;
