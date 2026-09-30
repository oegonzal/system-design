import {
  PROMPT_MARKDOWN_MAX_LENGTH,
  PROMPT_SOURCES,
  PROMPT_STATUSES,
  PROMPT_TITLE_MAX_LENGTH,
  promptDocumentSchema,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { listQueryShape } from '../../common/list-query';

/** The request shapes of the prompts routes — zod, so an unknown key is a 400 and a number is a number. */

export const authorPromptSchema = z.strictObject({
  ...promptDocumentSchema.shape,
  experienceId: z.uuid().optional(),
});

/** A library id is a path below the loop's prompt folder (`agentic/workflow-graph-engine`). */
export const importPromptSchema = z.strictObject({ libraryId: z.string().min(1).max(200) });

export const generatePromptSchema = z.strictObject({ experienceId: z.uuid().optional() });

export const updatePromptSchema = z.strictObject({
  status: z.enum(PROMPT_STATUSES).optional(),
  title: z.string().min(1).max(PROMPT_TITLE_MAX_LENGTH).optional(),
  markdown: z.string().min(1).max(PROMPT_MARKDOWN_MAX_LENGTH).optional(),
});

export const listPromptsQuerySchema = z.strictObject({
  ...listQueryShape,
  experienceId: z.uuid().optional(),
  source: z.enum(PROMPT_SOURCES).optional(),
  status: z.enum(PROMPT_STATUSES).optional(),
});
export type ListPromptsQueryInput = z.infer<typeof listPromptsQuerySchema>;
