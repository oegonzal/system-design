/**
 * The browser session's closed vocabularies. Nothing here names a site or a
 * form: a session is a goal document driven against whatever pages appear,
 * and these are the words its records, its plans and its routing share.
 */

export const BROWSER_SESSION_STATUSES = ['running', 'complete', 'stopped', 'failed'] as const;
export type BrowserSessionStatus = (typeof BROWSER_SESSION_STATUSES)[number];

/**
 * Why a plan may end the session — the model's word, chosen from the mission's
 * stop conditions. `limit-reached`: the site says no more today. `login-wall`:
 * the signed-in profile is signed out. `blocked`: the mission cannot proceed
 * from here and no step would change that.
 */
export const TERMINATE_CAUSES = [
  'mission-complete',
  'limit-reached',
  'login-wall',
  'blocked',
] as const;

/** Why the engine ends a session on its own: a declared rail, the operator, or a fault. */
export const ENGINE_TERMINATIONS = [
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  /** The page could not be read, observation after observation: there is nothing to plan against. */
  'page-unreadable',
  /**
   * The page has not changed across the declared number of observations in a
   * row, whatever the steps between them did: a plan that ran and moved
   * nothing is as stalled as one that was refused, and a fresh observation —
   * the hand-back's premise — is not there to have.
   */
  'page-stalled',
  'operator-stop',
  'error',
] as const;

export const BROWSER_SESSION_TERMINATIONS = [...TERMINATE_CAUSES, ...ENGINE_TERMINATIONS] as const;
export type BrowserSessionTermination = (typeof BROWSER_SESSION_TERMINATIONS)[number];

/** The status each termination leaves the session in. Exhaustive, so a new cause is classified where it is declared. */
export const TERMINATION_STATUS = {
  'mission-complete': 'complete',
  'limit-reached': 'complete',
  'login-wall': 'stopped',
  blocked: 'stopped',
  'max-tasks': 'stopped',
  'max-minutes': 'stopped',
  'max-failures': 'stopped',
  'brain-unavailable': 'stopped',
  'page-unreadable': 'stopped',
  'page-stalled': 'stopped',
  'operator-stop': 'stopped',
  error: 'failed',
} as const satisfies Record<BrowserSessionTermination, BrowserSessionStatus>;

export const BROWSER_TASK_STATUSES = ['open', 'complete', 'abandoned', 'failed'] as const;
export type BrowserTaskStatus = (typeof BROWSER_TASK_STATUSES)[number];

/** How one unit of work ended, in the mission's own terms. `already-done` is a unit the site reports as finished before. */
export const TASK_OUTCOMES = ['done', 'already-done', 'skipped', 'failed'] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

export const TASK_OUTCOME_STATUS = {
  done: 'complete',
  'already-done': 'complete',
  skipped: 'abandoned',
  failed: 'failed',
} as const satisfies Record<TaskOutcome, BrowserTaskStatus>;

/**
 * Whether a closed unit spends one of the session's `maxTasks`: a unit worked
 * to its end does, however it ended; one the site reported finished before, or
 * set aside unworked, does not. Measured 2026-10-07: under `--max-tasks 1`, a
 * listing found already applied to would have spent the session's whole budget
 * before any application, and the goal told the planner it could start no
 * other unit from the moment that listing was opened.
 */
export const TASK_OUTCOME_SPENDS = {
  done: true,
  'already-done': false,
  skipped: false,
  failed: true,
} as const satisfies Record<TaskOutcome, boolean>;

/** The outcomes that spend a unit of the budget, in the vocabulary's order. */
export const SPENDING_TASK_OUTCOMES: readonly TaskOutcome[] = TASK_OUTCOMES.filter(
  (outcome) => TASK_OUTCOME_SPENDS[outcome],
);

/** What a recorded decision is: a plan for a page, an answer for a field, or the end of the session. */
export const BROWSER_DECISION_KINDS = ['step-plan', 'field-answer', 'termination'] as const;
export type BrowserDecisionKind = (typeof BROWSER_DECISION_KINDS)[number];

/**
 * Who decided. `loop`: a quality-loop run. `memory`: a field filled from a
 * run that rested on recalled evidence. `operator`: the human at the terminal.
 * `blank`: left empty by rule. `engine`: a rail or a fault, never a judgement.
 */
export const BROWSER_DECISION_SOURCES = ['loop', 'memory', 'operator', 'blank', 'engine'] as const;
export type BrowserDecisionSource = (typeof BROWSER_DECISION_SOURCES)[number];

/** What the field-answer pipeline may decide for one field: a value, the value it already holds, an ask, a blank. */
export const FIELD_DECISIONS = ['answer', 'keep', 'ask-operator', 'leave-blank'] as const;

/** Ordinal confidence a producer states — never a number it invents. */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** What the session did with a field, after the decision and the routing rules; `keep` touches nothing. */
export const FIELD_ROUTES = ['fill', 'keep', 'ask-operator', 'leave-blank'] as const;
export type FieldRoute = (typeof FIELD_ROUTES)[number];

/** What kind of control a field is, for an operator prompt and a guidance record. */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'file',
  'unknown',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * DOM facts that mark a field a person would never see or fill — the
 * deterministic half of trap detection, read by the browser adapter and
 * judged by nobody. `autocomplete-off-bait`: an autocomplete-off text field
 * whose name is one a honeypot favours and which no visible label explains.
 */
export const HIDDEN_TRAITS = [
  'aria-hidden',
  'offscreen',
  'zero-size',
  'tabindex-negative',
  'autocomplete-off-bait',
] as const;
export type HiddenTrait = (typeof HIDDEN_TRAITS)[number];

/**
 * The roles that scope what a person can reach. Inside a modal one the rest
 * of the page waits behind it, so an observation names the open scope and a
 * plan is held to it; a non-modal one is noted and binds nothing.
 */
export const SCOPE_ROLES = ['dialog', 'alertdialog'] as const;
export type ScopeRole = (typeof SCOPE_ROLES)[number];

/**
 * How a snapshot too big for its budget is reduced, by declared rungs and
 * never a cut mid-page: the whole; the open scope whole and the rest reduced;
 * the nodes alone; only the nodes with refs; none. An observation and a
 * composed goal each say which rung the model is reading at.
 */
export const SNAPSHOT_RUNGS = ['full', 'scope', 'nodes-only', 'refs-only', 'none'] as const;
export type SnapshotRung = (typeof SNAPSHOT_RUNGS)[number];

/**
 * Roles whose inline text in a snapshot is what the control holds, not what
 * it is called: a textbox's line ends with its value. Words a person reads on
 * an unnamed element are gathered from everything beneath it except these.
 */
export const VALUE_ROLES = ['textbox', 'searchbox', 'combobox', 'spinbutton'] as const;

/** What an element affords: typed into, chosen from, pressed, or only read. */
export const ELEMENT_KINDS = ['fillable', 'selectable', 'clickable', 'static'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Role → kind, as a table; a role not listed is `static`. */
export const ELEMENT_KIND_BY_ROLE: Readonly<Record<string, ElementKind>> = {
  textbox: 'fillable',
  searchbox: 'fillable',
  spinbutton: 'fillable',
  combobox: 'selectable',
  listbox: 'selectable',
  radiogroup: 'selectable',
  radio: 'selectable',
  checkbox: 'clickable',
  switch: 'clickable',
  button: 'clickable',
  link: 'clickable',
  tab: 'clickable',
  menuitem: 'clickable',
  option: 'clickable',
};

/**
 * What a role affords on its own — all the observer knows before it reads the
 * page, which is why the adapter filters `static` nodes with this and decides
 * the element's kind with `elementKind` once the DOM facts are in hand.
 */
export const elementKindOf = (role: string): ElementKind => ELEMENT_KIND_BY_ROLE[role] ?? 'static';

/**
 * Input types that are chosen, toggled or picked rather than typed into. The
 * exceptions are what this names, because the text-entry types are open-ended
 * — `text`, `search`, `email`, `tel`, `url`, `password`, `date` and whatever
 * HTML adds next — so a list of those would call each new one unfillable.
 */
export const NON_TEXT_INPUT_TYPES = [
  'select',
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
] as const;

/** Whether the control beneath an element takes typed text; an element with no control does not. */
export const acceptsTypedText = (inputType: string | null): boolean =>
  inputType !== null && !(NON_TEXT_INPUT_TYPES as readonly string[]).includes(inputType);

/**
 * Roles the role name alone does not settle, and the kind each takes when the
 * control beneath it accepts typed text. An ARIA combobox is editable or not
 * by what it is built on: a `<textarea role="combobox">` is a search box and
 * is typed into, while `role="combobox"` on a button pops a list and is not.
 * Measured live on 2026-10-03 — the role-only table called a site's search
 * box `selectable`, the `limits` validator refused `fill` on it as "cannot be
 * typed into", and the session stopped at its failure rail with the mission's
 * one step never run.
 */
export const ELEMENT_KIND_WHEN_TYPED: Readonly<Record<string, ElementKind>> = {
  combobox: 'fillable',
};

/**
 * What an element affords, from its role and the control beneath it. Every
 * unambiguous role is the table's to decide; a role listed as ambiguous is
 * settled by the DOM facts the page already gave, never by the name alone.
 */
export const elementKind = (
  role: string,
  facts: { readonly inputType: string | null },
): ElementKind => {
  const typed = ELEMENT_KIND_WHEN_TYPED[role];
  return typed !== undefined && acceptsTypedText(facts.inputType) ? typed : elementKindOf(role);
};

/** What kind of page the plan believes it is on — a reading, not a route. */
export const PAGE_KINDS = [
  'listing',
  'detail',
  'form',
  'review',
  'confirmation',
  'login-wall',
  'limit-reached',
  'other',
] as const;

export const STEP_ACTION_KINDS = [
  'navigate',
  'click',
  'fill',
  'select',
  'press',
  'scroll',
  'waitFor',
  'screenshot',
  'askFields',
  'taskStart',
  'taskDone',
  'terminate',
  'done',
] as const;
export type StepActionKind = (typeof STEP_ACTION_KINDS)[number];

/**
 * What each action does to the page and to the plan, as one exhaustive table:
 * whether it touches the element it cites (a touch on a disabled, hidden or
 * unreachable element fails in the browser), what it can do to the page
 * (`replaces` it for certain; `may-change` it; nothing), whether it claims
 * something the page shows, and whether it ends the plan. Every list the
 * validators read is derived from here, so a new kind declares its effects
 * once and no rule has to be told about it. A wait is `none` by kind: a wait
 * for a URL or for text is its own declaration that the page will change
 * (`PAGE_REPLACING_WAITS`), and a wait for a listed element is a wait on
 * this page. A `taskDone` claims the page and ends nothing: closing a unit of
 * work is bookkeeping on the session's own ledger, so the next unit's click and
 * taskStart may follow it in the same plan. Measured 2026-10-05 and 2026-10-06 on
 * two providers: both reached for `taskDone, terminate` as one thought and were
 * refused, three times each, until the failure rail ended the session; and
 * 2026-10-07: a plan that closed an already-applied listing and moved on was
 * refused whole for what followed the close, twice.
 */
export interface ActionEffects {
  readonly touches: boolean;
  readonly page: 'none' | 'may-change' | 'replaces';
  readonly claims: boolean;
  readonly terminal: boolean;
}

const effects = (
  touches: boolean,
  page: ActionEffects['page'],
  claims = false,
  terminal = false,
): ActionEffects => ({ touches, page, claims, terminal });

export const ACTION_EFFECTS = {
  navigate: effects(false, 'replaces'),
  click: effects(true, 'may-change'),
  fill: effects(true, 'may-change'),
  select: effects(true, 'may-change'),
  press: effects(false, 'may-change'),
  scroll: effects(false, 'none'),
  waitFor: effects(false, 'none'),
  screenshot: effects(false, 'none'),
  askFields: effects(true, 'may-change'),
  taskStart: effects(false, 'none'),
  taskDone: effects(false, 'none', true),
  terminate: effects(false, 'none', true, true),
  done: effects(false, 'none', false, true),
} as const satisfies Record<StepActionKind, ActionEffects>;

const kindsWhere = (holds: (effect: ActionEffects) => boolean): readonly StepActionKind[] =>
  STEP_ACTION_KINDS.filter((kind) => holds(ACTION_EFFECTS[kind]));

/**
 * Actions that replace the page in front of the session for certain. Anything
 * planned after one would act on, or claim something about, a page nobody has
 * observed yet, so the limits validator cuts a plan there and the page it
 * opens is the next plan's to read. A click or a key press may or may not
 * replace the page, and the critics judge those.
 */
export const PAGE_REPLACING_ACTION_KINDS = kindsWhere((effect) => effect.page === 'replaces');

/**
 * The waits that are themselves a declaration that the page will change: a
 * plan that waits for a URL or for text it cannot see yet is waiting for a
 * page nobody has observed, and whatever it plans after the wait is planned
 * on that page. A wait for a listed element is a wait on this page.
 */
export const PAGE_REPLACING_WAITS = ['url', 'text'] as const;

/** The actions that end a plan; the validators require one of them last and nowhere else. */
export const TERMINAL_ACTION_KINDS = kindsWhere((effect) => effect.terminal);

/**
 * The actions that could leave the page other than it was observed. A
 * `taskDone` or `terminate` is a claim about what the page shows, and it can
 * rest only on the page as observed, so the validators refuse either after
 * any of these in the same plan: the page it would claim something about is
 * the next observation's to show. Measured 2026-10-07: twelve of twenty-two
 * plans closed their unit of work or ended the session on the far side of a
 * navigate, a click or a key press in the same plan — one of them `done`
 * after the Next button of page 1 of 9 of an application form.
 */
export const MUTATING_ACTION_KINDS = kindsWhere((effect) => effect.page !== 'none');

/** The terminal actions that claim something the page shows; `done` claims nothing. */
export const CLAIMING_ACTION_KINDS = kindsWhere((effect) => effect.claims);

export const PRESS_KEYS = [
  'Enter',
  'Tab',
  'Escape',
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Space',
] as const;

export const WAIT_UNTIL = ['element', 'text', 'url'] as const;

export const SCROLL_DIRECTIONS = ['down', 'up'] as const;

/** How a recorded step action went, as the next plan is told. */
export const STEP_OUTCOMES = ['ok', 'failed', 'not-executed'] as const;
