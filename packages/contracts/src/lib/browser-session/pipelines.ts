/**
 * The quality-loop pipelines and orchestrator a browser session runs, by id.
 * Declared once so the pipeline definitions, the session's brain adapter and
 * every fake name the same strings.
 */

/** One bounded plan for the page in front of the session. */
export const BROWSER_STEP_PIPELINE_ID = 'browser-step';

/** Every field of one form page answered from evidence, or routed to the operator. */
export const FIELD_ANSWER_PIPELINE_ID = 'field-answer';

/** Recalls facts for a form's fields without a model call, then runs the field-answer pipeline. */
export const FORM_MEMORY_ORCHESTRATOR_ID = 'form-memory';

/** Why the form-memory recall step skipped or failed — beyond the runner's own reasons. */
export const FORM_MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'store-empty',
  'embedding-failed',
  'no-fields',
] as const;
export type FormMemoryStepReason = (typeof FORM_MEMORY_STEP_REASONS)[number];

/** What the form-memory recall step reports beyond counts. */
export interface FormMemoryRecallReportDto {
  probes: number;
  candidates: number;
  evidence: number;
}

/** What the form-memory target step reports: whether the answers may be drawn on. */
export interface FormMemoryTargetReportDto {
  admission: string;
}

/** The pipelines a session derives a rubric for, once, and runs many times. */
export const BROWSER_SESSION_PIPELINES = {
  plan: BROWSER_STEP_PIPELINE_ID,
  answer: FIELD_ANSWER_PIPELINE_ID,
} as const;

/** Positional location ids the pipelines assign and the session reads back. */
export const actionLocation = (position: number): string => `action.${position + 1}`;
export const fieldLocation = (position: number): string => `field.${position + 1}`;
export const ACTION_LOCATION = /^action\.(\d+)$/;
export const FIELD_LOCATION = /^field\.(\d+)$/;

/** The zero-based position a location names, or null for another location. */
export function positionOf(location: string, grammar: RegExp): number | null {
  const match = grammar.exec(location);
  return match === null ? null : Number(match[1]) - 1;
}
