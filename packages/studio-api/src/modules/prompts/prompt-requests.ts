import {
  bound,
  bounded,
  CANVAS_CRITERION_KINDS,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  PRACTICE_FORMAT_IDS,
  PROMPT_SOURCES,
  PROMPT_STATUSES,
  promptDocumentSchema,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** The request shapes of the prompts routes — zod, so an unknown key is a 400 and a number is a number. */

const format = z.enum(PRACTICE_FORMAT_IDS).optional();

export const authorPromptSchema = z.strictObject({
  ...promptDocumentSchema.shape,
  experienceId: z.uuid().optional(),
  format,
});

/** A library id is a path below the loop's prompt folder (`agentic/workflow-graph-engine`): exact, never cut. */
const LIBRARY_ID_MAX_LENGTH = 200;

export const importPromptSchema = z.strictObject({
  libraryId: bounded.id(LIBRARY_ID_MAX_LENGTH, { min: 1 }),
  format,
});

/** The emphasised kinds are the declared kinds, so the list can never be longer than them; a repeat is folded by the service. */
const EMPHASIS_BOUND = bound(CANVAS_CRITERION_KINDS.length, 'list');

export const generatePromptSchema = z.strictObject({
  experienceId: z.uuid().optional(),
  format,
  emphasis: bounded.list(EMPHASIS_BOUND, z.enum(CANVAS_CRITERION_KINDS)).optional(),
});

/**
 * A rewrite takes what a create takes — the document's own fields, to the
 * ceilings they declare — so a title or text either route stored can be sent
 * back unchanged.
 */
export const updatePromptSchema = z.strictObject({
  status: z.enum(PROMPT_STATUSES).optional(),
  title: promptDocumentSchema.shape.title.optional(),
  markdown: promptDocumentSchema.shape.markdown.optional(),
});

export const listPromptsQuerySchema = z.strictObject({
  ...pageFields(MAX_LIST_LIMIT, DEFAULT_LIST_LIMIT),
  experienceId: z.uuid().optional(),
  source: z.enum(PROMPT_SOURCES).optional(),
  status: z.enum(PROMPT_STATUSES).optional(),
});
export type ListPromptsQueryInput = z.infer<typeof listPromptsQuerySchema>;
