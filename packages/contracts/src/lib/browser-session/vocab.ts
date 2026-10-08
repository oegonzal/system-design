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
 * from here and no step would change that. A mission may tie a cause to the
 * words the page shows when it holds (`mission-stops.ts`); a terminate for
 * such a cause is cut on a page without them.
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
 * The top-level ARIA landmarks a page is laid out in: what an element sits
 * in, read from the tree, so the goal can put the main content first and the
 * reader can tell a page whose main has not rendered from an empty one.
 * `region` and `form` are not here: they nest inside `main` and would pull
 * its elements out. Measured 2026-10-08: three observations of a results
 * page read "settled" with 33 elements, every one in the banner, the
 * navigation or the search box, and a `main` with nothing beneath it yet.
 */
export const LANDMARK_ROLES = [
  'banner',
  'navigation',
  'main',
  'complementary',
  'search',
  'contentinfo',
] as const;
export type LandmarkRole = (typeof LANDMARK_ROLES)[number];

/**
 * How a snapshot too big for its budget is reduced, by declared rungs and
 * never a cut mid-page: the whole; the open scope whole and the rest reduced;
 * the lines that carry words — a name, inline text, a text line — alone; the
 * nodes alone, their words gone; only the nodes with refs; none. An
 * observation and a composed goal each say which rung the model is reading at.
 */
export const SNAPSHOT_RUNGS = [
  'full',
  'scope',
  'words-only',
  'nodes-only',
  'refs-only',
  'none',
] as const;
export type SnapshotRung = (typeof SNAPSHOT_RUNGS)[number];
