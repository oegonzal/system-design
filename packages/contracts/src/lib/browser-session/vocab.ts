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
export type TerminateCause = (typeof TERMINATE_CAUSES)[number];

/** Why the engine ends a session on its own: a declared rail, the operator, or a fault. */
export const ENGINE_TERMINATIONS = [
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  'operator-stop',
  'error',
] as const;
export type EngineTermination = (typeof ENGINE_TERMINATIONS)[number];

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

/** What the field-answer pipeline may decide for one field. */
export const FIELD_DECISIONS = ['answer', 'ask-operator', 'leave-blank'] as const;
export type FieldDecision = (typeof FIELD_DECISIONS)[number];

/** Ordinal confidence a producer states — never a number it invents. */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** What the session did with a field, after the decision and the routing rules. */
export const FIELD_ROUTES = ['fill', 'ask-operator', 'leave-blank'] as const;
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

export const elementKindOf = (role: string): ElementKind => ELEMENT_KIND_BY_ROLE[role] ?? 'static';

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
export type PageKind = (typeof PAGE_KINDS)[number];

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

/** The actions that end a plan; the validators require one of them last and nowhere else. */
export const TERMINAL_ACTION_KINDS = ['taskDone', 'terminate', 'done'] as const;

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
export type PressKey = (typeof PRESS_KEYS)[number];

export const WAIT_UNTIL = ['element', 'text', 'url'] as const;
export type WaitUntil = (typeof WAIT_UNTIL)[number];

export const SCROLL_DIRECTIONS = ['down', 'up'] as const;
export type ScrollDirection = (typeof SCROLL_DIRECTIONS)[number];

/** How a recorded step action went, as the next plan is told. */
export const STEP_OUTCOMES = ['ok', 'failed', 'not-executed'] as const;
export type StepOutcome = (typeof STEP_OUTCOMES)[number];
