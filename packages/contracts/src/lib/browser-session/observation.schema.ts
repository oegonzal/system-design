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
/**
 * The most snapshot one observation carries. Sized so a page at every cap here
 * still renders under the engine's goal budget — the caps have to compose, and
 * this is the one that gives. The goal codec reduces what it is given into the
 * room the rest of the goal leaves, so a snapshot inside this bound is never
 * dropped for want of room that was there.
 */
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

/**
 * What the session carries forward about a plan that did not run: one entry
 * per objection, each kept whole.
 *
 * Sized from the live browser-step runs of 2026-10-03, where rationales
 * measured 245–600 characters (mean 398, p90 550) at 1–4 objections per plan,
 * and the loop caps a rationale at 900 before it is ever written here — so
 * nothing this holds is cut. That is the whole point of the bound. These
 * objections used to travel in a history entry's `note`, which is 300
 * characters and belongs to one action: the same plan-level text was copied
 * once per action, each copy cut at 300, and the cut landed on the clause
 * that said what to do instead. Measured live, a producer was handed ten
 * entries carrying two distinct objections, every copy ending mid-sentence
 * before its remedy, and five actions of duplication filled `HISTORY_MAX`
 * and evicted the record of what the session had actually done. It then
 * proposed the same plan three times and the session stopped at its failure
 * rail.
 */
export const OBJECTIONS_BOUND = bound(6, 'list');
/** The most objections the session keeps at once, however many plans are refused in a row. */
export const OBJECTIONS_MAX = 16;
export const OBJECTION_FROM_MAX_LENGTH = 60;
export const OBJECTION_AT_BOUND = bound(8, 'list');
export const OBJECTION_AT_MAX_LENGTH = 40;
export const OBJECTION_DETAIL_BOUND = bound(900);

/**
 * A ref exactly as Playwright's snapshot minted it, with nothing read into its
 * shape. `e12` for a node in the page's own document, `f1e7` for one inside a
 * frame, and whatever a later version mints: the session carries the token and
 * `aria-ref=` resolves it, so what has to hold is that it is safe to put in a
 * selector and short — not that it looks like any particular one of those
 * forms. Valid only for the observation that minted it.
 *
 * Measured live on 2026-10-03: a grammar of `e\d+` rejected every ref on a
 * search-results page, whose content sits in a frame. Every node came back
 * ref-less, so a page of 35 links read as having no interactive elements at
 * all; the snapshot's own refs-only rung, filtering by the same shape in a
 * second place, kept 0 of its 450 lines; and the producer was handed a
 * populated page described as empty and faulted for every plan it guessed
 * from it. One assumption about a token's spelling, three blindnesses.
 */
export const ELEMENT_REF = /^[a-z][a-z0-9]{0,19}$/;

/** The ref a snapshot line carries, read with the one declared grammar, or null when it carries none the session may use. */
export const refOf = (line: string): string | null => {
  const token = /\[ref=([^\]]*)\]/.exec(line)?.[1];
  return token !== undefined && ELEMENT_REF.test(token) ? token : null;
};

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

/**
 * What one read of the page did not reach. Never both zero: an observation
 * with nothing unread carries null instead.
 */
export const observationUnreadSchema = z.strictObject({
  /** Interactive elements the snapshot listed whose DOM facts never came back. */
  elements: z.number().int().min(0),
  /**
   * Non-blank snapshot lines the node grammar read nothing from — all of them,
   * when a snapshot with lines in it yields no node at all. A text that cannot
   * be read is not a page with nothing on it.
   */
  snapshotLines: z.number().int().min(0),
});
export type ObservationUnread = z.infer<typeof observationUnreadSchema>;

export const pageObservationSchema = z.strictObject({
  url: bounded.id(URL_MAX_LENGTH),
  title: bounded.text(TITLE_BOUND),
  elements: bounded.list(ELEMENTS_BOUND, observedElementSchema),
  /** Interactive elements the adapter saw and ranked but did not list, past the cap. */
  omittedElements: z.number().int().min(0),
  /**
   * What the adapter could not read of the page, or null when this observation
   * is the page. Counted and named rather than folded into `omittedElements`,
   * because the two mean opposite things to whoever plans next: elements past
   * the cap say the page has more of what you already have, while elements
   * that would not read say this observation is incomplete and its emptiness
   * proves nothing. Measured live on 2026-10-03, with both counted as one, a
   * results page that read as empty was rendered as "(no interactive
   * elements)" above "(135 more interactive elements not listed)" — and the
   * producer, reasoning from that, asserted a populated page and was faulted
   * for a misreading the goal had handed it.
   */
  unread: observationUnreadSchema.nullable(),
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

/**
 * One reason a plan did not run, as the objector put it. A critic's finding
 * and a validator's problem are both objections: the next plan has to answer
 * either, so both travel the same way. A plan-level objection names nothing
 * in `at`.
 */
export const stepObjectionSchema = z.strictObject({
  /** The session step whose plan drew it. */
  step: z.number().int().min(1),
  /** Who objected: a critic's finding type, or a validator's id. */
  from: bounded.id(OBJECTION_FROM_MAX_LENGTH),
  /** Where in the refused plan it sat, as the objector located it. */
  at: bounded.list(OBJECTION_AT_BOUND, bounded.id(OBJECTION_AT_MAX_LENGTH)),
  /** What was said, in the objector's own words and not a word shorter. */
  detail: bounded.text(OBJECTION_DETAIL_BOUND, { min: 1 }),
});
export type StepObjection = z.infer<typeof stepObjectionSchema>;

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
