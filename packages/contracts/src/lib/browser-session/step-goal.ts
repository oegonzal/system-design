/**
 * The goal codec of the `browser-step` pipeline. The session composes one
 * goal per page state — the mission verbatim, what the page shows, what was
 * just done and where the units of work stand — and the pipeline's validators
 * read the bookkeeping back from the last fenced block. Nothing here parses
 * prose: every fact a validator needs is in the index.
 */
import { quoted } from '../text';
import type { SuccessCriterion } from '../quality-loop/evidence';
import { GOAL_BUDGET_BYTES, renderIndexSection, withinBudget } from '../quality-loop/goal-index';
import type { RanAction } from './action-identity';
import { marksOf, marksOn, type Mark } from './mission-marks';
import type { StopOnPage } from './mission-stops';
import {
  inScope,
  OBJECTIONS_BOUND,
  type ObservedElement,
  type PageObservation,
  type StepHistoryEntry,
  type StepObjection,
  type TaskLedgerSummary,
} from './observation.schema';
import { SETTLING_CRITERION_KINDS } from './pipelines';
import { indexOf, shownOptions, type LastStep, type StepPageState } from './step-index';
import { limitsLines } from './step-limits';
import { LANDMARK_ROLES, TASK_OUTCOME_SPENDS, TASK_OUTCOMES, type LandmarkRole } from './vocab';

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

export interface StepGoalInput extends StepPageState {
  /** The goal document, verbatim. */
  mission: string;
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
   * The mission's stop words and whether the page shows them, read from the
   * page as the browser read it — before any fitting, so the room a goal had
   * for its snapshot never decides whether a stop is shown and a correct
   * terminate is never cut for words a reduced snapshot dropped.
   */
  stops: readonly StopOnPage[];
}

const optionsPart = (element: Pick<ObservedElement, 'options' | 'optionsOmitted'>): string => {
  const { shown, more } = shownOptions(element);
  return `options: ${shown.join(' | ')}${more > 0 ? ` (${more} more the page offers)` : ''}`;
};

/** One element as the model reads it: ref, role, name, then only the facts that are true of it. */
export function renderElementLine(element: ObservedElement, marks: readonly Mark[] = []): string {
  const parts = [element.ref, element.role, quoted(element.name)];
  // What a person reads on an element the tree gave no name, beside whatever stood in for one.
  if (element.text !== null && element.text !== '') parts.push(`text ${quoted(element.text)}`);
  if (element.inputType !== null) parts.push(`type ${element.inputType}`);
  if (element.value !== null && element.value !== '') parts.push(`value ${quoted(element.value)}`);
  if (element.options !== null) parts.push(optionsPart(element));
  if (element.required) parts.push('required');
  if (element.invalid) parts.push('marked invalid by the page');
  if (element.disabled) parts.push('disabled');
  if (!element.visible) parts.push('not visible');
  if (element.hiddenTraits.length > 0) parts.push(`hidden: ${element.hiddenTraits.join(', ')}`);
  // The mission's word on the item, beside the item: what a long name buries, said once more where it counts.
  for (const mark of marksOn(element, marks)) parts.push(`marked ${quoted(mark.token)}`);
  if (element.context !== null && element.context !== '')
    parts.push(`context ${quoted(element.context)}`);
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
 * The objections the next plan must answer: why the plans made on this page
 * did not run or were cut, newest first and each whole, by the position it
 * points at — never by the engine's step count or the id of the lens or
 * validator that raised it. Past the declared count the rest are counted
 * rather than cut, the way an observation counts the elements it does not list.
 */
const objectionLines = (objections: readonly StepObjection[]): string[] => {
  if (objections.length === 0) return ['(none — no plan made on this page has been refused)'];
  const carried = objections.slice(0, OBJECTIONS_BOUND.target);
  const lines = carried.map((objection) => {
    const at = objection.at.length === 0 ? 'the plan as a whole' : objection.at.join(', ');
    return `- ${at} — ${objection.detail}`;
  });
  const rest = objections.length - carried.length;
  return [
    'Why the plans made on this page did not run, or were cut, newest first:',
    ...lines,
    ...(rest === 0 ? [] : [`(${rest} older objection(s) not listed)`]),
  ];
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
  const outside = inLandmark(null);
  return [
    ...lines(inLandmark('main')),
    ...others.flatMap((landmark) => [
      `In the ${landmark} (${inLandmark(landmark).length}):`,
      ...lines(inLandmark(landmark)),
    ]),
    // Headed whenever a landmark is headed above them, so they never read as that landmark's.
    ...(others.length > 0 && outside.length > 0
      ? [`Outside every landmark (${outside.length}):`]
      : []),
    ...lines(outside),
  ];
}

function elementLines(observation: PageObservation, marks: readonly Mark[]): string[] {
  const { elements, activeScope } = observation;
  if (elements.length === 0) return ['(no interactive elements)'];
  const reachable = elements.filter((element) => element.visible && inScope(element, activeScope));
  const unlisted = elements.length - reachable.length;
  return [
    // What is not listed inside the dialog may be behind it. A unit was once
    // closed because a control seemed to be missing, when the open dialog was
    // only hiding it.
    ...(activeScope === null
      ? []
      : [
          `Inside the open ${activeScope.role} ${activeScope.name === '' ? '(unnamed)' : quoted(activeScope.name)} — the rest of the page waits behind it; an element not listed here may be behind the dialog, so its absence says nothing about the page:`,
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
    : `- Open unit of work: ${quoted(ledger.openTask.label)} at ${ledger.openTask.url} (a taskStart while it is open is skipped).`,
  ...(ledger.closed.length === 0
    ? ['- Closed this session: none yet.']
    : [
        '- Closed this session, oldest first:',
        ...ledger.closed.map((unit) => `  - ${quoted(unit.label)} — ${unit.outcome}`),
        ...(ledger.closedOmitted > 0 ? [`  (${ledger.closedOmitted} older not listed)`] : []),
      ]),
  `- Closed so far: ${TASK_OUTCOMES.map((outcome) => `${outcome} ${ledger.counts[outcome]}`).join(' · ')}.${
    ledger.remainingTasks === null
      ? ''
      : ` Units that may still be started: ${ledger.remainingTasks} — one closed ${TASK_OUTCOMES.filter(
          (outcome) => !TASK_OUTCOME_SPENDS[outcome],
        ).join(' or ')} does not count.`
  }`,
];

/** One action that ran, as the page would know it again: `click button "Next"`, `fill searchbox "Search" "x"`, `press Enter`. */
const describeRan = (ran: RanAction): string =>
  [
    ran.kind,
    ...(ran.role === null ? [] : [ran.role, quoted(ran.name ?? '')]),
    ...(ran.detail === null ? [] : [quoted(ran.detail)]),
  ].join(' ');

/** A heading, a blank line, the lines, a blank line: the shape every section of the goal has. */
const section = (heading: string, lines: readonly string[]): string[] => [
  heading,
  '',
  ...lines,
  '',
];

/**
 * What the last step did to this page, from engine facts: a plan that did not
 * run left the page as it was planned on; one that ran and moved nothing is
 * told so, with what it ran, since a recent action marked ok reads as a step
 * that worked; one that moved the page is told which action led here and what
 * it had planned past that action, which was held because the page it would
 * act on had not been seen yet — this is that page.
 */
function lastStepLines(last: LastStep, pageUnchanged: boolean): string[] {
  const touched = last.touched.map(describeRan);
  if (last.ran === 0) {
    return [
      pageUnchanged
        ? 'The last plan did not run: this is the page it was planned on.'
        : 'The last plan did not run, and the page has changed since it was planned.',
    ];
  }
  if (pageUnchanged) {
    return [
      touched.length === 0
        ? 'The last step ran, and this page did not change.'
        : `The last step ran ${touched.join('; ')} and this page did not change — repeating any of these is cut.`,
    ];
  }
  const reachedBy = touched.at(-1);
  return [
    ...(reachedBy === undefined ? [] : [`Reached by the last action that ran: ${reachedBy}.`]),
    ...(last.held.length === 0
      ? []
      : [
          `Planned after it and not run: ${last.held.join(', ')} — they were planned before this page could be seen; decide them from what this page shows.`,
        ]),
  ];
}

/** The page's address, then what the last step did to it. */
const pageLines = (input: StepGoalInput): string[] => [
  `URL: ${input.observation.url}`,
  `Title: ${input.observation.title}`,
  ...(input.lastStep === null ? [] : lastStepLines(input.lastStep, input.pageUnchanged)),
];

/** The elements, then what was left past the cap and what could not be read, each fact beside the thing it is about. */
const elementsSection = (observation: PageObservation, marks: readonly Mark[]): string[] => [
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
];

/** The snapshot as fitted, or that there is none — and when its lines could not be read, that this is not an empty page. */
const snapshotLines = (observation: PageObservation): string[] => [
  observation.ariaSnapshot.trim() || '(empty)',
  ...(observation.unread !== null && observation.unread.snapshotLines > 0
    ? [
        `(the page's own snapshot could not be read: ${observation.unread.snapshotLines} lines came back with nothing the session could use, so this is not a picture of an empty page)`,
      ]
    : []),
];

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeStepGoal(input: StepGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const { observation } = input;
  const marks = marksOf(input.mission);
  const { stops } = input;
  const goal = [
    // The mission brings its own heading — the template requires its `# Mission` — so the
    // goal never doubles it.
    input.mission.trim(),
    '',
    ...section('## Page', pageLines(input)),
    ...section('## Elements', elementsSection(observation, marks)),
    ...section('## Snapshot', snapshotLines(observation)),
    ...section('## Recent actions', historyLines(input.history)),
    ...section('## Objections to answer', objectionLines(input.objections)),
    ...section('## Units of work', ledgerLines(input.ledger)),
    ...section('## Progress', progressLines(input.progress)),
    ...section('## Limits', limitsLines({ marks, stops })),
    renderIndexSection(indexOf(input, marks, stops)),
  ].join('\n');
  return withinBudget(goal, budget);
}
