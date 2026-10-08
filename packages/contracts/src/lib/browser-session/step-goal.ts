/**
 * The goal codec of the `browser-step` pipeline. The session composes one
 * goal per page state — the mission verbatim, what the page shows, what was
 * just done and where the units of work stand — and the pipeline's validators
 * read the bookkeeping back from the last fenced block. Nothing here parses
 * prose: every fact a validator needs is in the index.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import type { SuccessCriterion } from '../quality-loop/evidence';
import {
  GOAL_BUDGET_BYTES,
  readFencedIndex,
  renderIndexSection,
  withinBudget,
} from '../quality-loop/goal-index';
import {
  ELEMENT_REF,
  OPTIONS_SHOWN,
  inScope,
  type ObservedElement,
  type PageObservation,
  OBJECTIONS_BOUND,
  type StepHistoryEntry,
  type StepObjection,
  type TaskLedgerSummary,
} from './observation.schema';
import { refNowOf, type RanAction } from './action-identity';
import { MARK_TOKEN_MAX_LENGTH, marksOf, marksOn, type Mark } from './mission-marks';
import { STOP_TOKEN_MAX_LENGTH, stopsOf, stopsOnPage, type StopOnPage } from './mission-stops';
import { BROWSER_STEP_PIPELINE_ID, SETTLING_CRITERION_KINDS } from './pipelines';
import { ACTIONS_BOUND } from './step-plan.schema';
import {
  ELEMENT_KINDS,
  HIDDEN_TRAITS,
  LANDMARK_ROLES,
  STEP_ACTION_KINDS,
  TERMINATE_CAUSES,
  TASK_OUTCOME_SPENDS,
  TASK_OUTCOMES,
  type LandmarkRole,
} from './vocab';

/**
 * Where the mission stands, as engine facts: the criteria settled for the
 * session — passed by the evaluator, earned by a plan that ran whole or by an
 * action that ran and said it served them, before any unit of work opened,
 * with the page then moved — which the rubric this run is judged against no
 * longer carries; and those passed the same way inside the open unit of
 * work, still carried and graded, because a step of a unit may repeat on its
 * next page.
 */
export interface StepProgress {
  /** The session's whole rubric, settled criteria included. */
  criteria: readonly SuccessCriterion[];
  settled: readonly string[];
  done: readonly string[];
}

export interface StepGoalInput {
  /** The goal document, verbatim. */
  mission: string;
  observation: PageObservation;
  /** Most recent last. */
  history: readonly StepHistoryEntry[];
  ledger: TaskLedgerSummary;
  /**
   * Why the plans before this one did not run, newest first — what the next
   * plan has to answer. Carried here rather than on the actions they were
   * about, so each one arrives whole and once.
   */
  objections: readonly StepObjection[];
  progress: StepProgress;
  /**
   * Whether this is the page the last plan was made against, unchanged: the
   * recent actions moved nothing on it. Said in the goal, because a recent
   * action marked ok reads as a step that worked. Measured 2026-10-07: a
   * producer pressed Enter and Tab on one unchanged dialog for twenty steps,
   * each press "ok".
   */
  pageUnchanged: boolean;
  /**
   * What ran at the last step, as the page would recognise it again. On an
   * unchanged page a repeat of one of these is cut: the page already answered
   * it. Measured 2026-10-08: nine steps of 31 were one click on one
   * already-selected card, repeated.
   */
  lastRan: readonly RanAction[];
}

/** The facts the validators check a plan against; everything else in the goal is for the model. */
export const stepIndexSchema = z.strictObject({
  pipeline: z.literal(BROWSER_STEP_PIPELINE_ID),
  maxActions: z.number().int().min(1),
  elements: z.array(
    z.strictObject({
      ref: z.string().regex(ELEMENT_REF),
      kind: z.enum(ELEMENT_KINDS),
      // Written only where it deviates — the read-back fills every default — so
      // an index of 150 elements costs what its deviations cost. Measured
      // 2026-10-08: 137 of 150 entries carried default facts alone.
      disabled: z.boolean().default(false),
      visible: z.boolean().default(true),
      /** Outside the open modal dialog: a person could not reach it. */
      behind: z.boolean().default(false),
      options: z.array(z.string()).nullable().default(null),
      /** Options the page offers past the listed ones; a select is held to the list only when this is zero. */
      optionsOmitted: z.number().int().min(0).default(0),
      hiddenTraits: z.array(z.enum(HIDDEN_TRAITS)).default([]),
      /** The mission's marks this element carries, by token; a marked element is passed over, never touched. */
      marks: z.array(bounded.id(MARK_TOKEN_MAX_LENGTH, { min: 1 })).default([]),
    }),
  ),
  /**
   * Whether the observation shows anything at all — a listed element, or a
   * snapshot at a rung above none. A terminate names a stop condition the page
   * shows and a taskDone an outcome the page shows; on a page that shows
   * nothing there is nothing for either to rest on, and the validators refuse
   * them there so the most consequential actions in the vocabulary never rest
   * on a claim alone. A snapshot at the none rung is its note line — text
   * that says nothing is shown — and an empty document is an empty snapshot
   * at the full rung; neither shows a thing.
   */
  pageShowsContent: z.boolean(),
  /** Whether this is the page the last plan was made against, unchanged. Written only when it is. */
  pageUnchanged: z.boolean().default(false),
  /**
   * What ran at the last step on this unchanged page, by this observation's
   * refs — null where the page no longer lists the element, or the action
   * named none. An action equal in kind, ref and detail is cut. Written only
   * when the page is unchanged.
   */
  lastRan: z
    .array(
      z.strictObject({
        kind: z.enum(STEP_ACTION_KINDS),
        ref: z.string().regex(ELEMENT_REF).nullable(),
        detail: z.string().nullable(),
      }),
    )
    .max(ACTIONS_BOUND.ceiling)
    .default([]),
  /**
   * The stop conditions the mission ties to words on the page, and whether
   * this page shows them. A terminate for a tied cause is cut when none of
   * its words is shown; a cause tied to no words is not listed and is the
   * judges' to assess. Written only when the mission ties a cause to words.
   */
  stops: z
    .array(
      z.strictObject({
        cause: z.enum(TERMINATE_CAUSES),
        token: bounded.id(STOP_TOKEN_MAX_LENGTH, { min: 1 }),
        shown: z.boolean(),
      }),
    )
    .default([]),
});
export type StepIndex = z.infer<typeof stepIndexSchema>;

const quote = (text: string): string => `"${text.replace(/\s+/g, ' ').trim()}"`;

/** The first `OPTIONS_SHOWN` options, then a count of those the page offers past them, so a cut list never reads as the whole. */
const shownOptions = (
  element: Pick<ObservedElement, 'options' | 'optionsOmitted'>,
): { shown: string[]; more: number } => {
  const options = element.options ?? [];
  const shown = options.slice(0, OPTIONS_SHOWN);
  return { shown, more: options.length - shown.length + element.optionsOmitted };
};

const optionsPart = (element: Pick<ObservedElement, 'options' | 'optionsOmitted'>): string => {
  const { shown, more } = shownOptions(element);
  return `options: ${shown.join(' | ')}${more > 0 ? ` (${more} more the page offers)` : ''}`;
};

/** One element as the model reads it: ref, role, name, then only the facts that are true of it. */
export function renderElementLine(element: ObservedElement, marks: readonly Mark[] = []): string {
  const parts = [element.ref, element.role, quote(element.name)];
  // What a person reads on an element the tree gave no name, beside whatever stood in for one.
  if (element.text !== null && element.text !== '') parts.push(`text ${quote(element.text)}`);
  if (element.inputType !== null) parts.push(`type ${element.inputType}`);
  if (element.value !== null && element.value !== '') parts.push(`value ${quote(element.value)}`);
  if (element.options !== null) parts.push(optionsPart(element));
  if (element.required) parts.push('required');
  if (element.invalid) parts.push('marked invalid by the page');
  if (element.disabled) parts.push('disabled');
  if (!element.visible) parts.push('not visible');
  if (element.hiddenTraits.length > 0) parts.push(`hidden: ${element.hiddenTraits.join(', ')}`);
  // The mission's word on the item, beside the item: what a long name buries, said once more where it counts.
  for (const mark of marksOn(element, marks)) parts.push(`marked ${quote(mark.token)}`);
  if (element.context !== null && element.context !== '')
    parts.push(`context ${quote(element.context)}`);
  return `- ${parts.join(' · ')}`;
}

/**
 * The recent actions, one line each. An entry that ran reads action first;
 * one that did not leads with that fact, so a proposal the session never
 * carried out cannot be read as something that happened — a `terminate` that
 * was refused is not a reason the session has been given to stop.
 */
const historyLines = (history: readonly StepHistoryEntry[]): string[] =>
  history.length === 0
    ? ['(none yet)']
    : history.map((entry) => {
        const note = entry.note === null ? '' : ` — ${entry.note}`;
        return entry.outcome === 'not-executed'
          ? `- not-executed (proposed, did not run): ${entry.action}${note}`
          : `- ${entry.action} — ${entry.outcome}${note}`;
      });

/**
 * The objections the next plan must answer, newest first and each whole. Past
 * the declared count the rest are counted rather than cut, the way an
 * observation counts the elements it does not list.
 */
const objectionLines = (objections: readonly StepObjection[]): string[] => {
  if (objections.length === 0) return ['(none — no plan has been refused yet)'];
  const carried = objections.slice(0, OBJECTIONS_BOUND.target);
  const lines = carried.map((objection) => {
    const at = objection.at.length === 0 ? 'the plan as a whole' : objection.at.join(', ');
    return `- step ${objection.step} · ${objection.from} at ${at} — ${objection.detail}`;
  });
  const rest = objections.length - carried.length;
  return rest === 0 ? lines : [...lines, `(${rest} older objection(s) not listed)`];
};

/**
 * The elements as the model reads them: those a person could reach — visible,
 * and inside the open dialog when one is open — one line each, and the rest
 * as one count. Every ref stays in the index whether listed or not, so a plan
 * that cites an unlisted one is refused by the validators rather than guessed
 * at. Measured 2026-10-07: a form page reached the model as 150 lines, 67 of
 * them hidden, with the open dialog's five fields among them unmarked.
 */
/**
 * The reachable elements by the landmark they sit in: the main content first
 * and unheaded, then each other landmark under its own line, then what sits
 * in none — so a results list is read before the chrome around it, and a
 * control in the banner's search box is still there to be cited. Measured
 * 2026-10-08: of 134 element lines on a results page, 75 were navigation,
 * filters, feedback and footer, listed among the 25 results.
 */
function groupedByLandmark(elements: readonly ObservedElement[], marks: readonly Mark[]): string[] {
  const inLandmark = (landmark: LandmarkRole | null): ObservedElement[] =>
    elements.filter((element) => element.landmark === landmark);
  const others = LANDMARK_ROLES.filter(
    (landmark) => landmark !== 'main' && inLandmark(landmark).length > 0,
  );
  const lines = (group: readonly ObservedElement[]): string[] =>
    group.map((element) => renderElementLine(element, marks));
  return [
    ...lines(inLandmark('main')),
    ...others.flatMap((landmark) => [
      `In the ${landmark} (${inLandmark(landmark).length}):`,
      ...lines(inLandmark(landmark)),
    ]),
    ...lines(inLandmark(null)),
  ];
}

function elementLines(observation: PageObservation, marks: readonly Mark[]): string[] {
  const { elements, activeScope } = observation;
  if (elements.length === 0) return ['(no interactive elements)'];
  const reachable = elements.filter((element) => element.visible && inScope(element, activeScope));
  const unlisted = elements.length - reachable.length;
  return [
    // What is not listed inside the dialog may be behind it: a unit closed on
    // "the pane shows no Easy Apply button" while the dialog hid the pane.
    ...(activeScope === null
      ? []
      : [
          `Inside the open ${activeScope.role} ${activeScope.name === '' ? '(unnamed)' : quote(activeScope.name)} — the rest of the page waits behind it; an element not listed here may be behind the dialog, so its absence says nothing about the page:`,
        ]),
    ...(reachable.length > 0
      ? groupedByLandmark(reachable, marks)
      : ['(no reachable interactive elements)']),
    ...(unlisted > 0
      ? [
          `(${unlisted} interactive elements not visible, hidden by the page or behind the open dialog are not listed and are never touched)`,
        ]
      : []),
  ];
}

/**
 * Where the mission stands: the settled criteria with their statements, since
 * the rubric this run reads no longer carries them; the ones done in the open
 * unit by id, since the rubric still does; and the rest of the settling kinds
 * by id, in the rubric's own order and with no claim about which is next.
 */
function progressLines(progress: StepProgress): string[] {
  const settling = progress.criteria.filter((criterion) =>
    (SETTLING_CRITERION_KINDS as readonly string[]).includes(criterion.kind),
  );
  const settled = settling.filter((criterion) => progress.settled.includes(criterion.id));
  const done = settling.filter(
    (criterion) => progress.done.includes(criterion.id) && !progress.settled.includes(criterion.id),
  );
  const open = settling.filter(
    (criterion) =>
      !progress.settled.includes(criterion.id) && !progress.done.includes(criterion.id),
  );
  const ids = (criteria: readonly SuccessCriterion[]): string =>
    criteria.map((criterion) => criterion.id).join(', ');
  return [
    ...(settled.length === 0
      ? ['- Satisfied earlier this session: none yet.']
      : [
          '- Satisfied earlier this session, not graded on this page:',
          ...settled.map((criterion) => `  - ${criterion.id} — ${criterion.statement}`),
        ]),
    `- Done in the open unit of work so far: ${done.length === 0 ? 'none' : ids(done)}.`,
    `- Still open: ${open.length === 0 ? 'none' : ids(open)}.`,
  ];
}

/**
 * The units of work as the planner is told them: the open one, the closed ones
 * by label and outcome so an item already handled is never taken up again, and
 * the counts with what the budget has left. Measured 2026-10-07: with only
 * counts to go on, the planner reopened the one listing the session had
 * handled, and the mission's "never the same listing twice" had nothing to
 * rest on.
 */
const ledgerLines = (ledger: TaskLedgerSummary): string[] => [
  ledger.openTask === null
    ? '- No unit of work is open: taskStart opens one when the procedure takes an item up; an item the mission says to pass over gets no taskStart.'
    : `- Open unit of work: ${quote(ledger.openTask.label)} at ${ledger.openTask.url} (a taskStart while it is open is skipped).`,
  ...(ledger.closed.length === 0
    ? ['- Closed this session: none yet.']
    : [
        '- Closed this session, oldest first:',
        ...ledger.closed.map((unit) => `  - ${quote(unit.label)} — ${unit.outcome}`),
        ...(ledger.closedOmitted > 0 ? [`  (${ledger.closedOmitted} older not listed)`] : []),
      ]),
  `- ${TASK_OUTCOMES.map((outcome) => `${outcome} ${ledger.counts[outcome]}`).join(' · ')}${
    ledger.remainingTasks === null
      ? ''
      : ` · may still start ${ledger.remainingTasks} (a unit closed ${TASK_OUTCOMES.filter(
          (outcome) => !TASK_OUTCOME_SPENDS[outcome],
        ).join(' or ')} spends none)`
  }`,
];

const indexOf = (
  input: StepGoalInput,
  marks: readonly Mark[],
  stops: readonly StopOnPage[],
): z.input<typeof stepIndexSchema> => ({
  pipeline: BROWSER_STEP_PIPELINE_ID,
  maxActions: ACTIONS_BOUND.target,
  elements: input.observation.elements.map((element) => ({
    ref: element.ref,
    kind: element.kind,
    ...(element.disabled ? { disabled: true } : {}),
    ...(element.visible ? {} : { visible: false }),
    ...(inScope(element, input.observation.activeScope) ? {} : { behind: true }),
    ...(element.options === null ? {} : { options: shownOptions(element).shown }),
    ...(shownOptions(element).more > 0 ? { optionsOmitted: shownOptions(element).more } : {}),
    ...(element.hiddenTraits.length > 0 ? { hiddenTraits: element.hiddenTraits } : {}),
    ...(marksOn(element, marks).length > 0
      ? { marks: marksOn(element, marks).map((mark) => mark.token) }
      : {}),
  })),
  pageShowsContent:
    input.observation.elements.length > 0 ||
    (input.observation.snapshotRung !== 'none' && input.observation.ariaSnapshot.trim() !== ''),
  ...(input.pageUnchanged && input.lastRan.length > 0
    ? {
        pageUnchanged: true,
        lastRan: input.lastRan.map((ran) => ({
          kind: ran.kind,
          ref: refNowOf(ran, input.observation.elements),
          detail: ran.detail,
        })),
      }
    : {}),
  ...(stops.length > 0 ? { stops: [...stops] } : {}),
});

/** The Limits line for the causes the mission ties to words: what each needs, and which of the words this page shows. */
function stopsLimit(stops: readonly StopOnPage[]): string {
  const needs = new Map<string, string[]>();
  for (const stop of stops) {
    needs.set(stop.cause, [...(needs.get(stop.cause) ?? []), quote(stop.token)]);
  }
  const shown = [...new Set(stops.filter((stop) => stop.shown).map((stop) => quote(stop.token)))];
  return `- A terminate is cut unless this page shows the words the mission ties to its cause — ${[...needs].map(([cause, tokens]) => `${cause} needs ${tokens.join(' or ')}`).join('; ')}. This page shows ${shown.length === 0 ? 'none of them' : shown.join(' and ')}.`;
}

/** One action that ran, as the page would know it again: `click button "Next"`, `fill searchbox "Search" "x"`, `press Enter`. */
const describeRan = (ran: RanAction): string =>
  [
    ran.kind,
    ...(ran.role === null ? [] : [ran.role, quote(ran.name ?? '')]),
    ...(ran.detail === null ? [] : [quote(ran.detail)]),
  ].join(' ');

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeStepGoal(input: StepGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const { observation } = input;
  const marks = marksOf(input.mission);
  const stops = stopsOnPage(stopsOf(input.mission), observation);
  const goal = [
    '# Mission',
    '',
    input.mission.trim(),
    '',
    '## Page',
    '',
    `URL: ${observation.url}`,
    `Title: ${observation.title}`,
    ...(input.pageUnchanged
      ? ['Unchanged since the last plan: the recent actions moved nothing on this page.']
      : []),
    ...(input.pageUnchanged && input.lastRan.length > 0
      ? [
          `Ran on it at the last step and moved nothing: ${input.lastRan.map(describeRan).join('; ')} — repeating any of these is cut.`,
        ]
      : []),
    '',
    '## Elements',
    '',
    ...elementLines(observation, marks),
    ...(observation.omittedElements > 0
      ? [`(${observation.omittedElements} more interactive elements not listed)`]
      : []),
    // Each fact beside the thing it is about, so "nothing listed" and "more
    // than are listed" can never read as one page: an element that would not
    // read is not an element you have.
    ...(observation.unread !== null && observation.unread.elements > 0
      ? [
          `(${observation.unread.elements} interactive elements were seen and could not be read: this observation is incomplete, and nothing follows from what it does not list)`,
        ]
      : []),
    '',
    '## Snapshot',
    '',
    observation.ariaSnapshot.trim() || '(empty)',
    ...(observation.unread !== null && observation.unread.snapshotLines > 0
      ? [
          `(the page's own snapshot could not be read: ${observation.unread.snapshotLines} lines came back with nothing the session could use, so this is not a picture of an empty page)`,
        ]
      : []),
    '',
    '## Recent actions',
    '',
    ...historyLines(input.history),
    '',
    '## Objections to answer',
    '',
    ...objectionLines(input.objections),
    '',
    '## Units of work',
    '',
    ...ledgerLines(input.ledger),
    '',
    '## Progress',
    '',
    ...progressLines(input.progress),
    '',
    '## Limits',
    '',
    // A cap reads as a quota unless it says otherwise. Measured on 2026-10-06:
    // asked for "at most 8 actions", a producer returned seven or eight nearly
    // every time — planning the whole mission in one step, citing refs for
    // pages it had not opened yet, and being refused by the two validators
    // this section is describing. Saying it is a ceiling costs five words.
    `- At most ${ACTIONS_BOUND.target} actions, in the order they run — a ceiling the validators enforce, never a number to reach. A terminate or done action is last and appears nowhere else. A taskDone closes a unit of work and touches no page: the plan may go on from it — the next unit's click and taskStart included — but it comes before any action that could change the page.`,
    // The `references` validator enforces exactly this, and the section that
    // exists to say what the validators enforce did not say it: an Elements
    // list belongs to one observation, so a plan that navigates and then cites
    // a ref is citing one that will not exist by the time it runs.
    // Not only what a plan may cite: what it may claim. A `taskDone` after a
    // submit names no ref and still asserts that a page nobody has observed
    // says what the plan hoped. Measured on 2026-10-06, five plans in eight
    // closed their unit of work and declared the mission complete on the far
    // side of a search they had not yet watched land.
    '- Cite refs only from the Elements list above, which belongs to this observation alone. An action that navigates, submits, or otherwise replaces the page is the LAST action of the plan: anything after it would act on, or claim something about, a page nobody has observed yet — closing a unit of work and terminating included. Plan up to it and leave the page it opens to the next plan.',
    '- Never act on a disabled, not-visible or behind-the-dialog element; fill only what can be typed into; select only a listed option, or where the list counts more the page offers, one of those, verbatim.',
    '- A field the page hides is never filled or selected.',
    // A claim rests on the page as observed. Measured 2026-10-07: twelve plans
    // closed their unit or ended the session past a click or a key press in
    // the same plan, one of them `done` after Next on page 1 of 9 of a form.
    '- A taskStart, taskDone or terminate claims what this page shows: it comes before any navigate, click, fill, select, press or askFields, never after.',
    ...(marks.length === 0
      ? []
      : [
          `- An element marked ${marks.map((mark) => quote(mark.token)).join(' or ')} carries a word the mission's Marks declare: it is passed over — never clicked, filled or selected, and never a unit of work.`,
        ]),
    ...(stops.length === 0 ? [] : [stopsLimit(stops)]),
    // The page already answered a repeated question. Measured 2026-10-08: nine
    // steps of 31 re-clicked the one card the pane already showed.
    '- On a page unchanged since the last plan, an action that ran at the last step — the same kind on the same element by role and name, with the same value, option, key or URL — is cut: the page already answered it. Act on another element this page lists, press a different key, scroll, or open or close the unit of work from what the page shows now.',
    '- Validators check these limits; they are not criteria.',
    '',
    renderIndexSection(indexOf(input, marks, stops)),
  ].join('\n');
  return withinBudget(goal, budget);
}

/** The index this codec wrote, or null for a goal that is not a browser step. */
export const readStepIndex = (goal: string): StepIndex | null =>
  readFencedIndex(goal, stepIndexSchema);
