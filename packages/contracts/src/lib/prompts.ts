import { z } from 'zod';

import type { ApiListResponse, ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';
import type { SuccessCriterion } from './quality-loop/evidence';
import type { QualityRunStartedDto, QualityRunStatus } from './quality-loop/runs';
import type { Decision } from './quality-loop/vocab';

/**
 * A prompt is one markdown document plus the criteria the quality loop
 * derived from it. The markdown is the goal every grading run reads verbatim;
 * the criteria are derived once and stay fixed for the prompt's life, so a
 * brief written against `c3` still means `c3` on the next revision. Nothing
 * structured about the prompt — no requirement lists, no scale fields, no
 * archetype — lives outside the text.
 */

export const PROMPT_STATUSES = ['active', 'archived'] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];

/** Where the document came from — the only provenance a prompt carries. */
export const PROMPT_SOURCES = ['authored', 'generated', 'library'] as const;
export type PromptSource = (typeof PROMPT_SOURCES)[number];

export const PROMPT_TITLE_MAX_LENGTH = 120;
export const PROMPT_MARKDOWN_MAX_LENGTH = 20_000;

/**
 * The sentences the API refuses a prompt change with and the studio shows
 * beside the control it disables — one wording, in the studio's own
 * vocabulary ("Unarchive"), never an id.
 */
export const PROMPT_COPY = {
  archived: 'This prompt is archived — unarchive it to practise it again.',
  criteriaLocked: 'This prompt already has practice sessions, so its criteria are fixed.',
  textLocked:
    'This prompt already has practice sessions, so its title and text are fixed — write a new prompt instead.',
  generatedCriteria:
    'This prompt was generated, so its criteria are its draft’s — rewrite it to derive new ones.',
} as const;

/** A title and a markdown body — what every source produces and what is stored. */
export const promptDocumentSchema = z.strictObject({
  title: z.string().min(1).max(PROMPT_TITLE_MAX_LENGTH),
  markdown: z.string().min(1).max(PROMPT_MARKDOWN_MAX_LENGTH),
});
export type PromptDocument = z.infer<typeof promptDocumentSchema>;

export interface PromptDto extends PromptDocument {
  id: Uuid;
  experienceId: Uuid | null;
  /** Empty until derived; the studio derives on first read and keeps the result. */
  criteria: SuccessCriterion[];
  source: PromptSource;
  status: PromptStatus;
  /**
   * True once any practice session was started on the prompt: its sessions
   * cite the criteria by id, so the criteria are never re-derived and the
   * title and text are never rewritten (both refused with 409).
   */
  rubricLocked: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** `POST /prompts` — write the prompt yourself. */
export interface AuthorPromptRequest extends PromptDocument {
  experienceId?: Uuid;
}

/** `POST /prompts/import` — copy one from the quality loop's library. */
export interface ImportPromptRequest {
  libraryId: string;
}

/**
 * `POST /prompts/generate` — draft one from an experience through the
 * quality loop's prompt pipeline. Omitted experience → the least-practised
 * one, so repeated practice covers every experience instead of re-drilling one.
 */
export interface GeneratePromptRequest {
  experienceId?: Uuid;
}

/** `GET /prompts/generate/:runId` — the run's state; `prompt` once the draft was claimed. */
export interface PromptGenerationDto {
  runId: string;
  status: QualityRunStatus;
  decision: Decision | null;
  overall: number | null;
  prompt: PromptDto | null;
  error: string | null;
}

export interface UpdatePromptRequest {
  status?: PromptStatus;
  title?: string;
  markdown?: string;
}

export interface ListPromptsQuery {
  experienceId?: Uuid;
  source?: PromptSource;
  status?: PromptStatus;
  limit?: number;
  offset?: number;
}

export type ListPromptsResponse = ApiListResponse<PromptDto>;
export type GetPromptResponse = ApiResponse<PromptDto>;
export type StartPromptGenerationResponse = ApiResponse<QualityRunStartedDto>;
export type GetPromptGenerationResponse = ApiResponse<PromptGenerationDto>;
