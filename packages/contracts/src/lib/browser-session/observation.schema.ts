/**
 * What the browser session saw: one page, its interactive elements with the
 * refs Playwright minted for them, and the recent past. This faces the
 * session program and its fakes, not a model, so numbers are fine here; the
 * goal composers turn it into text. Every bound is declared once: the
 * adapter clips what the page gives to a bound's target, and the schema
 * accepts its ceiling.
 */
import { z } from 'zod';

import { bound, bounded, exact } from '../bounds';
import { ELEMENT_KINDS, HIDDEN_TRAITS, STEP_OUTCOMES } from './vocab';

/** The most elements one observation lists; the adapter keeps visible, enabled ones first. */
export const ELEMENTS_BOUND = bound(150, 'list');
export const SNAPSHOT_BOUND = bound(16_000);
export const ELEMENT_NAME_BOUND = bound(300);
export const ELEMENT_VALUE_BOUND = bound(500);
export const OPTION_BOUND = bound(200);
export const OPTIONS_BOUND = bound(60, 'list');
export const ROLE_MAX_LENGTH = 40;
export const INPUT_TYPE_MAX_LENGTH = 30;
export const URL_MAX_LENGTH = 2000;
export const TITLE_BOUND = bound(300);
export const HISTORY_MAX = 10;
export const HISTORY_ACTION_BOUND = bound(200);
export const HISTORY_NOTE_BOUND = bound(300);
export const TASK_LABEL_BOUND = bound(200);

/** A ref exactly as Playwright's snapshot minted it: `e12`. Valid only for the observation that minted it. */
export const ELEMENT_REF = /^e\d+$/;

export const observedElementSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF),
  role: bounded.id(ROLE_MAX_LENGTH, { min: 1 }),
  name: bounded.text(ELEMENT_NAME_BOUND),
  kind: z.enum(ELEMENT_KINDS),
  /** The input's declared type when it has one: text, number, email, tel, file, date… */
  inputType: bounded.id(INPUT_TYPE_MAX_LENGTH).nullable(),
  value: bounded.text(ELEMENT_VALUE_BOUND).nullable(),
  options: bounded.list(OPTIONS_BOUND, bounded.text(OPTION_BOUND)).nullable(),
  required: z.boolean(),
  disabled: z.boolean(),
  visible: z.boolean(),
  maxLength: z.number().int().positive().nullable(),
  hiddenTraits: bounded.list(exact(HIDDEN_TRAITS.length), z.enum(HIDDEN_TRAITS)),
  /** Nearby label or help text a form shows beside the control, when the accessible name alone is terse. */
  context: bounded.text(ELEMENT_NAME_BOUND).nullable(),
});
export type ObservedElement = z.infer<typeof observedElementSchema>;

export const pageObservationSchema = z.strictObject({
  url: bounded.id(URL_MAX_LENGTH),
  title: bounded.text(TITLE_BOUND),
  elements: bounded.list(ELEMENTS_BOUND, observedElementSchema),
  /**
   * Interactive elements the adapter saw but did not list: past the cap, or
   * not readable inside the observation's budget. An element whose DOM facts
   * did not arrive is counted here rather than listed, because the adapter
   * cannot say it is enabled, visible or untrapped — and a plan may act only
   * on what the observation listed.
   */
  omittedElements: z.number().int().min(0),
  /** The accessibility snapshot as text, clipped to its budget. */
  ariaSnapshot: bounded.text(SNAPSHOT_BOUND),
});
export type PageObservation = z.infer<typeof pageObservationSchema>;

export const stepHistoryEntrySchema = z.strictObject({
  action: bounded.text(HISTORY_ACTION_BOUND, { min: 1 }),
  outcome: z.enum(STEP_OUTCOMES),
  note: bounded.text(HISTORY_NOTE_BOUND).nullable(),
});
export type StepHistoryEntry = z.infer<typeof stepHistoryEntrySchema>;

export const taskLedgerSummarySchema = z.strictObject({
  openTask: z
    .strictObject({ label: bounded.text(TASK_LABEL_BOUND), url: bounded.id(URL_MAX_LENGTH) })
    .nullable(),
  done: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** Units of work the session may still start; null when the rail is not set. */
  remainingTasks: z.number().int().min(0).nullable(),
});
export type TaskLedgerSummary = z.infer<typeof taskLedgerSummarySchema>;
