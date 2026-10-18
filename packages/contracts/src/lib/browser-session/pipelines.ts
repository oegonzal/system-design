/**
 * The quality-loop pipelines and orchestrator a browser session runs, by id.
 * Declared once so the pipeline definitions, the session's brain adapter and
 * every fake name the same strings.
 */
import { z } from 'zod';

import { ADMISSIONS, withheldRefSchema } from '../quality-loop/admission';

/** One bounded plan for the page in front of the session. */
export const BROWSER_STEP_PIPELINE_ID = 'browser-step';

/** Every field of one form page answered from evidence, or routed to the operator. */
export const FIELD_ANSWER_PIPELINE_ID = 'field-answer';

/** Several suggested answers for each field the operator is asked, from the record, or drafted and labelled so. */
export const ANSWER_SUGGESTIONS_PIPELINE_ID = 'answer-suggestions';

/**
 * The pipelines whose goal is one form's fields with evidence recalled about
 * the subject: the codec writes which one a goal is for into its index, and
 * the form-memory orchestrator runs exactly the one a request names from this
 * list.
 */
export const FORM_PIPELINES = [FIELD_ANSWER_PIPELINE_ID, ANSWER_SUGGESTIONS_PIPELINE_ID] as const;
export type FormPipeline = (typeof FORM_PIPELINES)[number];

/** Recalls facts for a form's fields without a model call, then runs the form pipeline the request names. */
export const FORM_MEMORY_ORCHESTRATOR_ID = 'form-memory';

/** The form-memory step that runs the form pipeline: the run a session reads its answers from. */
export const FORM_MEMORY_TARGET_STEP = 'target';

/** What the form-memory target step reports: the run's admission, and the locations a reader of it withholds. */
export const formTargetReportSchema = z.strictObject({
  admission: z.enum(ADMISSIONS),
  withheld: z.array(withheldRefSchema),
});

/** Why the form-memory recall step skipped or failed — beyond the runner's own reasons. */
export const FORM_MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'store-empty',
  'embedding-failed',
  'no-fields',
] as const;
export type FormMemoryStepReason = (typeof FORM_MEMORY_STEP_REASONS)[number];

/**
 * The criterion kinds a session settles for the rest of the session once a
 * plan the evaluator passed them on has run whole and the page has moved: a
 * step of the mission taken before any unit of work opened is not taken
 * again on every page after it. A kind not listed here — a never-do line, a
 * reading of the page — is in force on every page and is never settled.
 * Measured 2026-10-07: the criterion for the mission's first step was failed
 * by the evaluator on six pages after it had been taken, and passed for
 * twelve re-navigations to the page it was taken on.
 */
export const SETTLING_CRITERION_KINDS = ['progress'] as const;

/** The pipelines a session derives a rubric for, once, and runs many times. */
export const BROWSER_SESSION_PIPELINES = {
  plan: BROWSER_STEP_PIPELINE_ID,
  answer: FIELD_ANSWER_PIPELINE_ID,
  suggest: ANSWER_SUGGESTIONS_PIPELINE_ID,
} as const;

/** Positional location ids the pipelines assign and the session reads back. */
export const actionLocation = (position: number): string => `action.${position + 1}`;
export const fieldLocation = (position: number): string => `field.${position + 1}`;
export const ACTION_LOCATION = /^action\.(\d+)$/;
/** One suggestion of one field: `field.2.1` is the second field's first suggestion. */
export const suggestionLocation = (field: number, suggestion: number): string =>
  `field.${field + 1}.${suggestion + 1}`;
