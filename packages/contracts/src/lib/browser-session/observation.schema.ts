/**
 * What the browser session saw: one page, its interactive elements with the
 * refs Playwright minted for them, and the recent past. This faces the
 * session program and its fakes, not a model, so numbers are fine here; the
 * goal composers turn it into text.
 */
import { z } from 'zod';

import { ELEMENT_KINDS, HIDDEN_TRAITS, STEP_OUTCOMES } from './vocab';

/** The most elements one observation lists; the adapter keeps visible, enabled ones first. */
export const MAX_ELEMENTS = 150;
export const SNAPSHOT_MAX_BYTES = 16_000;
export const ELEMENT_NAME_MAX = 300;
export const ELEMENT_VALUE_MAX = 500;
export const OPTION_MAX = 200;
export const MAX_OPTIONS = 60;
export const URL_MAX = 2000;
export const TITLE_MAX = 300;
export const HISTORY_MAX = 10;
export const HISTORY_ACTION_MAX = 200;
export const HISTORY_NOTE_MAX = 300;
export const TASK_LABEL_MAX = 200;

/** A ref exactly as Playwright's snapshot minted it: `e12`. Valid only for the observation that minted it. */
export const ELEMENT_REF = /^e\d+$/;

export const observedElementSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF),
  role: z.string().min(1).max(40),
  name: z.string().max(ELEMENT_NAME_MAX),
  kind: z.enum(ELEMENT_KINDS),
  /** The input's declared type when it has one: text, number, email, tel, file, date… */
  inputType: z.string().max(30).nullable(),
  value: z.string().max(ELEMENT_VALUE_MAX).nullable(),
  options: z.array(z.string().max(OPTION_MAX)).max(MAX_OPTIONS).nullable(),
  required: z.boolean(),
  disabled: z.boolean(),
  visible: z.boolean(),
  maxLength: z.number().int().positive().nullable(),
  hiddenTraits: z.array(z.enum(HIDDEN_TRAITS)).max(HIDDEN_TRAITS.length),
  /** Nearby label or help text a form shows beside the control, when the accessible name alone is terse. */
  context: z.string().max(ELEMENT_NAME_MAX).nullable(),
});
export type ObservedElement = z.infer<typeof observedElementSchema>;

export const pageObservationSchema = z.strictObject({
  url: z.string().max(URL_MAX),
  title: z.string().max(TITLE_MAX),
  elements: z.array(observedElementSchema).max(MAX_ELEMENTS),
  /** Interactive elements the adapter saw but did not list, past the cap. */
  omittedElements: z.number().int().min(0),
  /** The accessibility snapshot as text, clipped to its budget. */
  ariaSnapshot: z.string().max(SNAPSHOT_MAX_BYTES),
});
export type PageObservation = z.infer<typeof pageObservationSchema>;

export const stepHistoryEntrySchema = z.strictObject({
  action: z.string().min(1).max(HISTORY_ACTION_MAX),
  outcome: z.enum(STEP_OUTCOMES),
  note: z.string().max(HISTORY_NOTE_MAX).nullable(),
});
export type StepHistoryEntry = z.infer<typeof stepHistoryEntrySchema>;

export const taskLedgerSummarySchema = z.strictObject({
  openTask: z
    .strictObject({ label: z.string().max(TASK_LABEL_MAX), url: z.string().max(URL_MAX) })
    .nullable(),
  done: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** Units of work the session may still start; null when the rail is not set. */
  remainingTasks: z.number().int().min(0).nullable(),
});
export type TaskLedgerSummary = z.infer<typeof taskLedgerSummarySchema>;
