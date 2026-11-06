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
import { unitFacetsSchema } from '../units/identity';
import { UNIT_NOTE_BOUND } from '../units/vocab';
import { STEP_OUTCOMES } from './action-effects';
import { ELEMENT_KINDS } from './element-kind';
import { HIDDEN_TRAITS, LANDMARK_ROLES, SCOPE_ROLES, SNAPSHOT_RUNGS, TASK_OUTCOMES } from './vocab';

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
 * The units on record the session refused a taskStart for, which every later
 * goal of the session lists, newest first; older ones are counted. Measured
 * 2026-10-19 → 10-31: 86 of 160 refused taskStarts named a unit the same
 * session had refused already, the refusal's objection gone from the goal
 * and the unit itself past the record's rendered bound.
 */
export const REFUSED_UNITS_BOUND = bound(10, 'list');

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
 * text follow. A line YAML would misread unquoted — a name with `: ` in it,
 * among others — comes with everything before its colon wrapped in single
 * quotes, every quote inside doubled: the same node, the wrap read as
 * `quote`. A text line (`- text: …`) matches with the one pseudo-role; a
 * property line (`- /url: …`) matches nothing. Declared once, here, so the
 * adapter that decodes a tree and the fingerprint that compares two pages
 * read the same lines the same way. Measured 2026-10-13: 7 wrapped node lines
 * in 6 of 786 recorded snapshots, every one a question control with a ref,
 * each read as no node at all — the field was never answered, and a page
 * refusing to advance over it stalled the session.
 */
export const SNAPSHOT_NODE_LINE =
  /^(?<indent> *)- (?<quote>')?(?<role>[a-z][\w-]*)(?: "(?<name>(?:[^"\\]|\\.)*)")?(?<attrs>(?: \[[^\]]*\])*)\k<quote>\s*(?::\s*(?<inline>.*))?$/;
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

/** The element a read listed under a ref: refs are minted per read, so only that read's elements answer for one. */
export const elementByRef = <E extends Pick<ObservedElement, 'ref'>>(
  elements: readonly E[],
  ref: string,
): E | undefined => elements.find((element) => element.ref === ref);

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

/** How many candidates one read's loading check records whole; the rest are counted. */
export const BUSY_SIGHTS_BOUND = bound(8, 'list');
/** A tag or attribute value, as the page wrote it on a candidate. */
export const BUSY_ATTRIBUTE_BOUND = bound(80);
/** One loading check per whole read an observation takes: the first, and up to four more until two agree. */
const BUSY_READS_BOUND = bound(5, 'list');

/**
 * One element the loading check looked at inside a dialog in front of the
 * page — anything that can say "still loading" by ARIA: `aria-busy`, a
 * progressbar, a progress element — with the facts the rule decides on, and
 * whether it held the read back. Recorded because the verdict alone never
 * said why it held: measured 2026-10-10, a dialog holding only its close
 * button, a heading and a progressbar read as settled twice, and nothing in
 * the dump told a bar that carried a value from one the check could not see.
 */
const busySightSchema = z.strictObject({
  tag: bounded.text(BUSY_ATTRIBUTE_BOUND, { min: 1 }),
  role: bounded.text(BUSY_ATTRIBUTE_BOUND).nullable(),
  ariaBusy: bounded.text(BUSY_ATTRIBUTE_BOUND).nullable(),
  ariaValueNow: bounded.text(BUSY_ATTRIBUTE_BOUND).nullable(),
  ariaValueText: bounded.text(BUSY_ATTRIBUTE_BOUND).nullable(),
  /** A progress element's `value` attribute, as written. */
  value: bounded.text(BUSY_ATTRIBUTE_BOUND).nullable(),
  /** What the browser's `checkVisibility()` answered for it. */
  visible: z.boolean(),
  /** Whether it held the read back: a busy indicator by the rule, and visible. */
  counted: z.boolean(),
});

/** What one read's loading check saw: the dialogs in front it looked inside, and every candidate it found there, in page order. */
const busyReadSchema = z.strictObject({
  scopes: z.number().int().min(0),
  seen: bounded.list(BUSY_SIGHTS_BOUND, busySightSchema),
  /** Candidates past the bound, counted. */
  unseen: z.number().int().min(0),
});
export type BusyRead = z.infer<typeof busyReadSchema>;

/**
 * What the read itself cost, apart from what it found: how many whole reads
 * it took for two in a row to agree, whether they did, how long the
 * observation took, and what each read's loading check saw. Facts about the
 * reader, never about the page — the fingerprint leaves them out — kept so a
 * live session can size the reader, and judge its rules, from data.
 */
export const observationReadingSchema = z.strictObject({
  reads: z.number().int().min(1),
  settled: z.boolean(),
  durationMs: z.number().int().min(0),
  /** One entry per read counted in `reads`, in order. */
  busy: bounded.list(BUSY_READS_BOUND, busyReadSchema),
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
 * The engine's own objectors, beside the lenses and validators of the loop:
 * the controller, when nothing named a finding or a problem and only its
 * reason remains; the session, when it refuses an action itself. Declared
 * once, so a reader of a session's objections can enumerate who may object.
 */
export const ENGINE_OBJECTORS = { controller: 'controller', session: 'session' } as const;

export const taskLedgerSummarySchema = z.strictObject({
  openTask: z
    .strictObject({
      label: bounded.text(TASK_LABEL_BOUND),
      url: bounded.id(URL_MAX_LENGTH),
      /** The unit's identity as the plan declared it; empty when the mission declares no facets. */
      facets: unitFacetsSchema,
    })
    .nullable(),
  /**
   * The units closed this session, oldest first, within the bound; by label,
   * since that is what a list item shows, and by identity, so the next plan
   * can keep off an item that shares one with a unit already handled.
   */
  closed: bounded.list(
    CLOSED_TASKS_BOUND,
    z.strictObject({
      label: bounded.text(TASK_LABEL_BOUND),
      outcome: z.enum(TASK_OUTCOMES),
      facets: unitFacetsSchema,
    }),
  ),
  /** Closed units older than the bound keeps: counted, so the list never reads as the whole. */
  closedOmitted: z.number().int().min(0),
  /**
   * The units on record a taskStart named this session and the session
   * refused, newest first, within the bound: by identity, with the record's
   * note, so a later plan keeps off an item the session met on record however
   * far the record's own list is cut.
   */
  refused: bounded.list(
    REFUSED_UNITS_BOUND,
    z.strictObject({ facets: unitFacetsSchema, note: bounded.text(UNIT_NOTE_BOUND) }),
  ),
  /** Refused units older than the bound keeps: counted, so the list never reads as the whole. */
  refusedOmitted: z.number().int().min(0),
  /** Units of work closed so far, by outcome — every outcome the vocabulary declares, zero included. */
  counts: z.record(z.enum(TASK_OUTCOMES), z.number().int().min(0)),
  /** Units of work the session may still spend under its rail; null when the rail is not set. */
  remainingTasks: z.number().int().min(0).nullable(),
  /** Units of work the session is asked to close `done` before it ends complete; null when no target is set. */
  targetDone: z.number().int().min(1).nullable(),
});
export type TaskLedgerSummary = z.infer<typeof taskLedgerSummarySchema>;
