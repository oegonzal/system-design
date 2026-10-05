/**
 * The goal codec of the `browser-step` pipeline. The session composes one
 * goal per page state — the mission verbatim, what the page shows, what was
 * just done and where the units of work stand — and the pipeline's validators
 * read the bookkeeping back from the last fenced block. Nothing here parses
 * prose: every fact a validator needs is in the index.
 */
import { z } from 'zod';

import {
  GOAL_BUDGET_BYTES,
  readFencedIndex,
  renderFencedIndex,
  withinBudget,
} from '../quality-loop/goal-index';
import {
  ELEMENT_REF,
  type ObservedElement,
  type PageObservation,
  OBJECTIONS_BOUND,
  type StepHistoryEntry,
  type StepObjection,
  type TaskLedgerSummary,
} from './observation.schema';
import { BROWSER_STEP_PIPELINE_ID } from './pipelines';
import { ACTIONS_BOUND } from './step-plan.schema';
import { ELEMENT_KINDS, HIDDEN_TRAITS } from './vocab';

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
}

/** The facts the validators check a plan against; everything else in the goal is for the model. */
export const stepIndexSchema = z.strictObject({
  pipeline: z.literal(BROWSER_STEP_PIPELINE_ID),
  maxActions: z.number().int().min(1),
  elements: z.array(
    z.strictObject({
      ref: z.string().regex(ELEMENT_REF),
      kind: z.enum(ELEMENT_KINDS),
      disabled: z.boolean(),
      options: z.array(z.string()).nullable(),
      hiddenTraits: z.array(z.enum(HIDDEN_TRAITS)),
    }),
  ),
  openTask: z.boolean(),
});
export type StepIndex = z.infer<typeof stepIndexSchema>;

const quote = (text: string): string => `"${text.replace(/\s+/g, ' ').trim()}"`;

/** One element as the model reads it: ref, role, name, then only the facts that are true of it. */
export function renderElementLine(element: ObservedElement): string {
  const parts = [element.ref, element.role, quote(element.name)];
  if (element.inputType !== null) parts.push(`type ${element.inputType}`);
  if (element.value !== null && element.value !== '') parts.push(`value ${quote(element.value)}`);
  if (element.options !== null) parts.push(`options: ${element.options.join(' | ')}`);
  if (element.required) parts.push('required');
  if (element.disabled) parts.push('disabled');
  if (!element.visible) parts.push('not visible');
  if (element.hiddenTraits.length > 0) parts.push(`hidden: ${element.hiddenTraits.join(', ')}`);
  if (element.context !== null && element.context !== '')
    parts.push(`context ${quote(element.context)}`);
  return `- ${parts.join(' · ')}`;
}

const historyLines = (history: readonly StepHistoryEntry[]): string[] =>
  history.length === 0
    ? ['(none yet)']
    : history.map(
        (entry) =>
          `- ${entry.action} — ${entry.outcome}${entry.note === null ? '' : ` — ${entry.note}`}`,
      );

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

const ledgerLines = (ledger: TaskLedgerSummary): string[] => [
  ledger.openTask === null
    ? '- No unit of work is open.'
    : `- Open unit of work: ${quote(ledger.openTask.label)} at ${ledger.openTask.url}`,
  `- Done ${ledger.done} · skipped ${ledger.skipped} · failed ${ledger.failed}${
    ledger.remainingTasks === null ? '' : ` · may still start ${ledger.remainingTasks}`
  }`,
];

const indexOf = (input: StepGoalInput): StepIndex => ({
  pipeline: BROWSER_STEP_PIPELINE_ID,
  maxActions: ACTIONS_BOUND.target,
  elements: input.observation.elements.map((element) => ({
    ref: element.ref,
    kind: element.kind,
    disabled: element.disabled,
    options: element.options,
    hiddenTraits: element.hiddenTraits,
  })),
  openTask: input.ledger.openTask !== null,
});

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeStepGoal(input: StepGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const { observation } = input;
  const goal = [
    '# Mission',
    '',
    input.mission.trim(),
    '',
    '## Page',
    '',
    `URL: ${observation.url}`,
    `Title: ${observation.title}`,
    '',
    '## Elements',
    '',
    ...(observation.elements.length > 0
      ? observation.elements.map(renderElementLine)
      : ['(no interactive elements)']),
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
    '## Limits',
    '',
    `- At most ${ACTIONS_BOUND.target} actions, in the order they run; a taskDone, terminate or done action is last and appears nowhere else.`,
    '- Cite refs only from the Elements list. Never act on a disabled element; fill only what can be typed into; select only a listed option.',
    '- A field the page hides is never filled or selected.',
    '- taskStart only while no unit of work is open; taskDone only while one is.',
    '- Validators check these limits; they are not criteria.',
    '',
    '## Index',
    '',
    renderFencedIndex(indexOf(input)),
  ].join('\n');
  return withinBudget(goal, budget);
}

/** The index this codec wrote, or null for a goal that is not a browser step. */
export const readStepIndex = (goal: string): StepIndex | null =>
  readFencedIndex(goal, stepIndexSchema);
