/**
 * The browser session's closed vocabularies. Nothing here names a site or a
 * form: a session is a goal document driven against whatever pages appear,
 * and these are the words its records, its plans and its routing share.
 */

export const BROWSER_SESSION_STATUSES = ['running', 'complete', 'stopped', 'failed'] as const;
export type BrowserSessionStatus = (typeof BROWSER_SESSION_STATUSES)[number];

/**
 * A plan ended the session on one of the stops its mission declares under
 * `## Stop conditions` (`mission-stops.ts`). Which stop — its cause word — and
 * the status it leaves the session in are the mission's to declare; the engine
 * records only that a mission stop ended the session, and which one.
 */
export const MISSION_STOP = 'mission-stop';

/** Why the engine ends a session on its own: a declared rail, the operator, or a fault. */
export const ENGINE_TERMINATIONS = [
  /**
   * The session's own goal, not a limit: the number of units of work it was
   * asked to close `done` (`SessionRailsDto.targetDone`) closed so. Every
   * other rail is a limit and ends the session stopped; this one ends it
   * complete.
   */
  'target-reached',
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

export type EngineTermination = (typeof ENGINE_TERMINATIONS)[number];

/**
 * A session whose process stopped beating without closing it — killed,
 * crashed, the machine put to sleep — as the next session to start finds it.
 * Nothing ended it, so nothing the mission or the engine declares can be said
 * of it; a close that later arrives from that process overwrites it with what
 * did.
 */
export const INTERRUPTED = 'interrupted';

/** What is said of an interrupted session: the last sign of life it gave, as an ISO instant. */
export const interruptedDetail = (lastBeat: string): string =>
  `stopped beating at ${lastBeat} without closing`;

/** The status an interrupted session is left in: it ended on no rule of its own. */
export const INTERRUPTED_STATUS = 'failed' satisfies BrowserSessionStatus;

export const BROWSER_SESSION_TERMINATIONS = [
  MISSION_STOP,
  ...ENGINE_TERMINATIONS,
  INTERRUPTED,
] as const;
export type BrowserSessionTermination = (typeof BROWSER_SESSION_TERMINATIONS)[number];

/** The statuses a mission's stop may leave the session in; which one, the mission declares beside the cause. */
export const STOP_ENDINGS = [
  'complete',
  'stopped',
] as const satisfies readonly BrowserSessionStatus[];
export type StopEnding = (typeof STOP_ENDINGS)[number];

/**
 * The status each engine termination leaves the session in. Exhaustive, so a
 * new one is classified where it is declared; a mission stop's status is the
 * mission's (`STOP_ENDINGS`).
 */
export const TERMINATION_STATUS = {
  'target-reached': 'complete',
  'max-tasks': 'stopped',
  'max-minutes': 'stopped',
  'max-failures': 'stopped',
  'brain-unavailable': 'stopped',
  'page-unreadable': 'stopped',
  'page-stalled': 'stopped',
  'operator-stop': 'stopped',
  error: 'failed',
} as const satisfies Record<EngineTermination, BrowserSessionStatus>;

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

/**
 * What a suggested answer rests on: the record itself, the subject's real
 * adjacent work carried over, or experience the record does not hold,
 * modelled on the subject's past. Labelled apart, because a chosen suggestion
 * becomes the operator's own answer.
 */
export const SUGGESTION_BASES = ['record', 'transfer', 'invented'] as const;
export type SuggestionBasis = (typeof SUGGESTION_BASES)[number];

/**
 * How a value rests on the listed evidence: the one word the read-back routes
 * by, through the answering settings' table of which kinds fill. Declared by
 * the answerer, checked by the judges, never a number. Measured 2026-10-12:
 * under a three-word confidence the read-back could not tell a fact
 * transferred from another wording from a fact invented, and 36 answered
 * fields went to the operator — 30 of the 34 whose answer is known were right.
 */
export const ANSWER_BASES = [
  'stated',
  'restated',
  'derived',
  'mapped',
  'inferred',
  'composed',
  'policy',
  'none',
] as const;
export type AnswerBasis = (typeof ANSWER_BASES)[number];

/** What each kind means, rendered into the answerer's schema and the goal's Limits from this one table. */
export const ANSWER_BASIS_MEANINGS: Readonly<Record<AnswerBasis, string>> = {
  stated: 'the evidence states the value as the field asks for it',
  restated:
    'the evidence states the same fact in other words, to another question or in another unit of work; the latest statement stands',
  derived:
    'computed or split from stated facts: a span from dates, a part from a whole, one form of an identifier from another',
  mapped: "a stated fact fitted onto this field's options, exactly one option fitting",
  inferred: 'what adjacent evidence makes likely without stating it',
  composed:
    "prose assembled from stated facts, in the answerer's words, adding nothing they do not state",
  policy:
    'what a line of the Answering policy names as the value this question takes, whatever the record holds',
  none: 'nothing listed bears on it',
};

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
export const SNAPSHOT_RUNGS = ['full', 'scope', 'words-only', 'words-cut', 'none'] as const;
export type SnapshotRung = (typeof SNAPSHOT_RUNGS)[number];
