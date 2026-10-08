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
import { GOAL_BUDGET_BYTES } from '../quality-loop/goal-index';
import {
  ELEMENT_KINDS,
  HIDDEN_TRAITS,
  LANDMARK_ROLES,
  SCOPE_ROLES,
  SNAPSHOT_RUNGS,
  STEP_OUTCOMES,
  TASK_OUTCOMES,
} from './vocab';

/** The most elements one observation lists; the adapter keeps those inside the open scope first, then visible, enabled ones. */
export const ELEMENTS_BOUND = bound(150, 'list');
/**
 * The most snapshot one observation carries: the engine's whole goal budget.
 * The goal codec fits the snapshot into the room the rest of the goal leaves,
 * so the observation's own bound only has to be no tighter than that room can
 * ever be. Measured 2026-10-07 with this at 16 000: eight observations in a
 * row reached the model as `[snapshot reduced to none]` while their goals sat
 * at 25–37 KB of the 64 KB budget — the bound bit first, and the room went
 * unused.
 */
export const SNAPSHOT_BOUND = bound(GOAL_BUDGET_BYTES);
export const ELEMENT_NAME_BOUND = bound(300);
export const ELEMENT_VALUE_BOUND = bound(500);
export const OPTION_BOUND = bound(200);
/**
 * The most options an observation keeps for one select: a country list runs
 * to about 250. The step goal shows `OPTIONS_SHOWN` of them and counts the
 * rest; the field goal shows them all, since the answerer must name one
 * verbatim. Measured 2026-10-07 with this at 60 and no count: "United States
 * (+1)" sat past the cut, no model ever saw it, and the limits validator
 * refused the select of it five times as "not an option".
 */
export const OPTIONS_BOUND = bound(300, 'list');
/** How many of a select's options the step goal lists before counting the rest. */
export const OPTIONS_SHOWN = 60;
export const ROLE_MAX_LENGTH = 40;
export const INPUT_TYPE_MAX_LENGTH = 30;
export const URL_MAX_LENGTH = 2000;
export const TITLE_BOUND = bound(300);
export const HISTORY_MAX = 10;
export const HISTORY_ACTION_BOUND = bound(200);
export const HISTORY_NOTE_BOUND = bound(300);
export const TASK_LABEL_BOUND = bound(200);
/**
 * The closed units of work the next goal lists, most recent last; older ones
 * are counted, never cut silently. Measured 2026-10-07: the planner reopened
 * the listing it had already handled, because nothing told it which it had.
 */
export const CLOSED_TASKS_BOUND = bound(10, 'list');

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

/**
 * The attributes a snapshot line carries about the moment it was read, not
 * about the page: the ref token the adapter mints per read, and where focus
 * sits. Neither is identity — a page a click left as it was has moved only its
 * focus. Measured 2026-10-08: two re-clicks of an already-selected card
 * differed from the step before in nothing but `[active]`, and passed for a
 * page that moved.
 */
export const MOMENT_ATTRIBUTES = ['ref', 'active'] as const;

/** The ref a snapshot line carries, read with the one declared grammar, or null when it carries none the session may use. */
export const refOf = (line: string): string | null => {
  const token = /\[ref=([^\]]*)\]/.exec(line)?.[1];
  return token !== undefined && ELEMENT_REF.test(token) ? token : null;
};

/**
 * The grammar of one line of Playwright's `ariaSnapshot({ mode: 'ai' })`: a
 * node per line, indented two spaces per level — a role, an optional quoted
 * name, bracketed attributes, and a trailing colon when children or inline
 * text follow. A text line (`- text: …`) matches with the one pseudo-role; a
 * property line (`- /url: …`) matches nothing. Declared once, here, so the
 * adapter that decodes a tree and the fingerprint that compares two pages
 * read the same lines the same way.
 */
export const SNAPSHOT_NODE_LINE =
  /^(?<indent> *)- (?<role>[a-z][\w-]*)(?: "(?<name>(?:[^"\\]|\\.)*)")?(?<attrs>(?: \[[^\]]*\])*)\s*(?::\s*(?<inline>.*))?$/;
export const SNAPSHOT_TEXT_ROLE = 'text';

/** A node line without the text after its colon, or null for a line that is no node: a property line, a text line. */
export function nodeLineOf(line: string): string | null {
  const groups = SNAPSHOT_NODE_LINE.exec(line)?.groups;
  if (!groups?.['role'] || groups['role'] === SNAPSHOT_TEXT_ROLE) return null;
  const inline = groups['inline'] ?? '';
  return inline === '' ? line : line.slice(0, line.length - inline.length).replace(/:\s*$/, '');
}

/** The snapshot's structure alone: its node lines, each without its inline text. */
export const nodesOnly = (snapshot: string): string[] =>
  snapshot.split('\n').flatMap((line) => {
    const node = nodeLineOf(line);
    return node === null ? [] : [node];
  });

/**
 * The dialog an element sits in, by role and name: the identity a scope keeps
 * from one observation to the next, when every ref is minted afresh. `modal`
 * is the DOM's word (`aria-modal`, or a native dialog opened modally) that the
 * rest of the page waits behind it.
 */
export const elementScopeSchema = z.strictObject({
  role: z.enum(SCOPE_ROLES),
  name: bounded.text(ELEMENT_NAME_BOUND),
  modal: z.boolean(),
});
export type ElementScope = z.infer<typeof elementScopeSchema>;

/** The open modal scope, as the page names it; what a plan is held to. */
export const activeScopeSchema = z.strictObject({
  role: z.enum(SCOPE_ROLES),
  name: bounded.text(ELEMENT_NAME_BOUND),
});
export type ActiveScope = z.infer<typeof activeScopeSchema>;

/** Whether an element sits inside the open scope; every element does when none is open. */
export const inScope = (
  element: { readonly scope: ElementScope | null },
  active: ActiveScope | null,
): boolean =>
  active === null ||
  (element.scope !== null &&
    element.scope.role === active.role &&
    element.scope.name === active.name);

export const observedElementSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF),
  role: bounded.id(ROLE_MAX_LENGTH, { min: 1 }),
  name: bounded.text(ELEMENT_NAME_BOUND),
  /**
   * What a person reads on an element the accessibility tree gives no name:
   * the words beneath it in the tree, else the text the DOM renders. Null
   * whenever the tree named it. Measured live 2026-10-07: 26 of 37 elements
   * on a search landing page were `link ""` and `button ""`, 25 of them with
   * their words one level down in a paragraph.
   */
  text: bounded.text(ELEMENT_NAME_BOUND).nullable(),
  kind: z.enum(ELEMENT_KINDS),
  /** The input's declared type when it has one: text, number, email, tel, file, date… */
  inputType: bounded.id(INPUT_TYPE_MAX_LENGTH).nullable(),
  value: bounded.text(ELEMENT_VALUE_BOUND).nullable(),
  options: bounded.list(OPTIONS_BOUND, bounded.text(OPTION_BOUND)).nullable(),
  /** Options the page offers past the listed ones, counted: a list is never cut silently. */
  optionsOmitted: z.number().int().min(0),
  required: z.boolean(),
  /** Whether the page marks the control invalid: `aria-invalid`, or the browser's own validity once a person has touched it. */
  invalid: z.boolean(),
  disabled: z.boolean(),
  visible: z.boolean(),
  maxLength: z.number().int().positive().nullable(),
  hiddenTraits: bounded.list(exact(HIDDEN_TRAITS.length), z.enum(HIDDEN_TRAITS)),
  /** Nearby label or help text a form shows beside the control, when the accessible name alone is terse. */
  context: bounded.text(ELEMENT_NAME_BOUND).nullable(),
  /** The dialog it sits in, or null for an element of the page itself. */
  scope: elementScopeSchema.nullable(),
  /** The top-level landmark it sits in, read from the tree — main, banner, navigation… — or null outside every one. */
  landmark: z.enum(LANDMARK_ROLES).nullable(),
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

/**
 * What the read itself cost, apart from what it found: how many whole reads
 * it took for two in a row to agree, whether they did, and how long the
 * observation took. Facts about the reader, never about the page — the
 * fingerprint leaves them out — kept so a live session can size the reader
 * from data.
 */
export const observationReadingSchema = z.strictObject({
  reads: z.number().int().min(1),
  settled: z.boolean(),
  durationMs: z.number().int().min(0),
});
export type ObservationReading = z.infer<typeof observationReadingSchema>;

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
  /**
   * The modal dialog that is open, when one is: the elements inside it are
   * what a person can reach, and the goal lists those first and the rest as
   * behind it. Null when the page itself is what is in front.
   */
  activeScope: activeScopeSchema.nullable(),
  /** The accessibility snapshot as text, reduced to its budget by rung. */
  ariaSnapshot: bounded.text(SNAPSHOT_BOUND),
  /**
   * Which rung `ariaSnapshot` is at — data, so that a page whose snapshot was
   * reduced to its note line is never read as a page that shows something.
   */
  snapshotRung: z.enum(SNAPSHOT_RUNGS),
  reading: observationReadingSchema,
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
  /** The units closed this session, oldest first, within the bound; by label, since that is what a list item shows. */
  closed: bounded.list(
    CLOSED_TASKS_BOUND,
    z.strictObject({ label: bounded.text(TASK_LABEL_BOUND), outcome: z.enum(TASK_OUTCOMES) }),
  ),
  /** Closed units older than the bound keeps: counted, so the list never reads as the whole. */
  closedOmitted: z.number().int().min(0),
  /** Units of work closed so far, by outcome — every outcome the vocabulary declares, zero included. */
  counts: z.record(z.enum(TASK_OUTCOMES), z.number().int().min(0)),
  /** Units of work the session may still spend under its rail; null when the rail is not set. */
  remainingTasks: z.number().int().min(0).nullable(),
});
export type TaskLedgerSummary = z.infer<typeof taskLedgerSummarySchema>;
