import {
  ADVISORS_HEADING,
  composeFieldGoal,
  composeStepGoal,
  CONTEXT_HEADING,
  DOCUMENTS_HEADING,
  MARKS_HEADING,
  PROCEDURE_HEADING,
  STOPS_HEADING,
  stopsOf,
  stopsOnPage,
  TAKEN_HEADING,
  takenOf,
  takenOnPage,
  TASK_EVENTS_HEADING,
  GOAL_BUDGET_BYTES,
  GoalBudgetExceeded,
  textBytes,
  withoutSections,
  type FieldGoalInput,
  type FormPipeline,
  type PageObservation,
  type StepGoalInput,
  quoted,
} from '@sysdesign/contracts';

import type { UnitContext } from '../../core/open-unit';
import type { FieldsInput, GoalComposition } from '../../core/ports';
// The snapshot's own codec, not a browser: it reduces snapshot text by the
// declared rungs and never touches a page.
import { firstThatFit, fitSnapshot, withoutUnlistedRefs } from '../../core/snapshot/aria-snapshot';
import { snapshotScopeOf } from '../../core/snapshot/snapshot-scope';

/**
 * The goals the session composes for the loop, fitted to the loop's budget
 * by a declared ladder rather than a silent cut. A page too large for the
 * full goal loses first its snapshot, then the context and long values of
 * its elements, then elements themselves — halved until it fits, the number
 * dropped counted — and the rung used is reported with the goal so the dump
 * says what the model saw. A page that cannot fit even so is a refusal.
 */
export const GOAL_RUNGS = [
  'full',
  'without-snapshot',
  'trimmed-context',
  'fewer-elements',
] as const;
export type GoalRung = (typeof GOAL_RUNGS)[number];

export interface ComposedGoal extends GoalComposition {
  goal: string;
  rung: GoalRung;
  /** Interactive elements the goal does not list, the observation's own and the ladder's together. */
  omittedElements: number;
}

const TRIMMED_VALUE_MAX = 60;

const withoutSnapshot = (observation: PageObservation): PageObservation => ({
  ...observation,
  ariaSnapshot: '',
  snapshotRung: 'none',
});

const trimmedContext = (observation: PageObservation): PageObservation => ({
  ...withoutSnapshot(observation),
  elements: observation.elements.map((element) => ({
    ...element,
    context: null,
    value:
      element.value === null || element.value.length <= TRIMMED_VALUE_MAX
        ? element.value
        : `${element.value.slice(0, TRIMMED_VALUE_MAX)}…`,
  })),
});

/**
 * The observation with its snapshot fitted to the room the rest of the goal
 * leaves, rather than to a constant of its own.
 *
 * Measured live on 2026-10-05: a form page of 1,415 snapshot lines reached the
 * producer as `[snapshot reduced to none: 1415 of 1415 lines not shown]`,
 * while the goal it arrived in came to 35KB of a 64KB budget. Twenty-nine
 * kilobytes of room went unused because the snapshot had been cut to a fixed
 * size before anything knew how large the goal would be. What was in those
 * lines was the page's own validation message — static text, which no element
 * list carries — so the session could not read why the form would not advance.
 * It guessed, and the critics faulted it for guessing, three steps running.
 *
 * The goal is composed once without a snapshot to measure what else it says;
 * what remains of the budget is the snapshot's. The ladder below still has
 * work to do when the elements alone fill the goal.
 */
function snapshotFitted(
  input: StepGoalInput,
  observation: PageObservation,
  budget: number,
): { observation: PageObservation; rung: GoalRung } {
  const bare = composeStepGoal(
    { ...input, observation: withoutSnapshot(observation) },
    Number.MAX_SAFE_INTEGER,
  );
  const room = Math.max(0, budget - textBytes(bare));
  // A ref the observation does not list cannot be cited, so it leaves its line
  // before the room is measured; an open dialog, modal or not, is kept whole
  // and the rest of the page reduced first: its lines are what the plan acts on.
  const listed = new Set(observation.elements.map((element) => element.ref));
  const fitted = fitSnapshot(
    withoutUnlistedRefs(observation.ariaSnapshot, listed),
    room,
    snapshotScopeOf(observation.activeScope, observation.elements),
  );
  return {
    observation: {
      ...observation,
      ariaSnapshot: fitted.text,
      // What fits whole here is still at whatever rung the observation already reduced it to.
      snapshotRung: fitted.rung === 'full' ? observation.snapshotRung : fitted.rung,
    },
    // A snapshot reduced within itself leaves the goal whole and says so in
    // its own first line; one there was no room for at all is a goal without a
    // snapshot, and the rung the dump records has to say which happened.
    rung: fitted.rung === 'none' && observation.ariaSnapshot !== '' ? 'without-snapshot' : 'full',
  };
}

/** The goal composed at one rung, or null when it does not fit. */
function attempt(
  input: StepGoalInput,
  observation: PageObservation,
  rung: GoalRung,
  budget: number,
): ComposedGoal | null {
  try {
    const goal = composeStepGoal({ ...input, observation }, budget);
    return {
      goal,
      rung,
      bytes: textBytes(goal),
      snapshotRung: observation.snapshotRung,
      omittedElements: observation.omittedElements,
    };
  } catch (error) {
    if (error instanceof GoalBudgetExceeded) return null;
    throw error;
  }
}

export function composeStepGoalWithinBudget(
  page: Omit<StepGoalInput, 'stops' | 'taken'>,
  budget = GOAL_BUDGET_BYTES,
): ComposedGoal {
  // Read from the page as the browser read it, before any rung below reduces it.
  const input: StepGoalInput = {
    ...page,
    stops: stopsOnPage(stopsOf(page.mission), page.observation),
    taken: takenOnPage(takenOf(page.mission), page.observation),
  };
  const { observation: full, rung } = snapshotFitted(input, input.observation, budget);
  const trimmed = trimmedContext(full);
  const fitted =
    attempt(input, full, rung, budget) ??
    attempt(input, withoutSnapshot(full), 'without-snapshot', budget) ??
    attempt(input, trimmed, 'trimmed-context', budget);
  if (fitted !== null) return fitted;

  let elements = trimmed.elements;
  while (elements.length > 0) {
    elements = elements.slice(0, Math.floor(elements.length / 2));
    const omittedElements = full.omittedElements + (full.elements.length - elements.length);
    const fewer = attempt(
      input,
      { ...trimmed, elements, omittedElements },
      'fewer-elements',
      budget,
    );
    if (fewer !== null) return fewer;
  }
  throw new GoalBudgetExceeded(textBytes(input.mission), budget);
}

/** The heading the form goal states the open unit of work under; the lenses name it. */
export const OPEN_UNIT_HEADING = '## Open unit of work';

/**
 * The form goal fitted to the loop's budget by a declared ladder of its own:
 * the unit's statement whole; the statement cut to the room the rest of the
 * goal leaves, at a node boundary; no statement line at all. The mission and
 * the fields are never cut — a form page is answered on the fields it lists —
 * so a goal that does not fit even so is a refusal, as a step goal's is. The
 * ladder is measured with whatever evidence its composer brings: the
 * statement yields to the fields and to that evidence, a declared order
 * rather than a size that happens to fit one mission. A composer that brings
 * none leaves the evidence to fill what room the statement leaves.
 */
type FieldGoalRung = 'full' | 'statement-cut' | 'without-statement';

interface ComposedFieldGoal extends GoalComposition {
  goal: string;
  rung: FieldGoalRung;
}

/** The node lines a statement carries: one node, one line, as the snapshot grammar reads a node from one line. */
const statementLines = (context: UnitContext): string[] => context.text.split('\n');

/**
 * The title over what the page stated about the unit: the landmark it was read
 * from, that a landmark may hold other items beside the unit, and how many of
 * its nodes the goal shows — every one, the first so many, or none — so no
 * reader takes the beginning for the whole, or the landmark's list for the
 * unit's own words.
 */
function statementTitle(context: UnitContext, shown: number): string {
  const total = statementLines(context).length + context.omitted;
  const head = `What the page laid out under its ${context.landmark} landmark as the unit opened — its words, node by node, which may name other items beside this unit`;
  if (shown === total) return `${head}:`;
  if (shown === 0) return `${head} — none of its ${total} nodes fit this goal.`;
  return `${head} — the first ${shown} of ${total} nodes, ${total - shown} not shown:`;
}

/** The statement as the goal states it: the title, then the first `shown` of its lines. */
const statementSection = (context: UnitContext, shown: number): string[] => [
  '',
  statementTitle(context, shown),
  ...(shown === 0 ? [] : ['', ...statementLines(context).slice(0, shown)]),
];

/**
 * The sections of a mission only the planner reads — how a unit is worked,
 * stopped on, taken on record and reported, the marks, landmark, advisors and
 * documents a plan reads by — which no field's answer rests on. A form goal
 * leaves them out and carries every other section — the site's own
 * descriptions and both policies among them — whole and in order. Measured
 * 2026-11-07: carried whole, a mission left 81 bytes of the budget beside a
 * statement at its bound and the heaviest recorded fields, and these sections
 * held 6.3 KB of it.
 */
const PLANNER_SECTIONS: ReadonlySet<string> = new Set([
  PROCEDURE_HEADING,
  TASK_EVENTS_HEADING,
  STOPS_HEADING,
  TAKEN_HEADING,
  MARKS_HEADING,
  CONTEXT_HEADING,
  ADVISORS_HEADING,
  DOCUMENTS_HEADING,
]);

/**
 * The prose half of a field-answer goal: the mission less the sections only
 * the planner reads (`PLANNER_SECTIONS`), and the unit of work the fields
 * belong to — with the identity its mission declared, so a
 * question about "this employer" is answered against a declared value, never a
 * reading of the label; and with what the page stated about the unit when it
 * opened — the first `shown` of its node lines, every one by default — so a
 * question about the unit itself rests on the page's own words.
 */
export function renderFieldProse(
  input: Pick<FieldsInput, 'mission' | 'task'>,
  shown: number | null = null,
): string {
  const facets =
    input.task === null || input.task.facets.length === 0
      ? ''
      : ` · ${input.task.facets.map((facet) => `${facet.name} ${quoted(facet.value)}`).join(' · ')}`;
  const context = input.task?.context ?? null;
  const statement =
    context === null ? [] : statementSection(context, shown ?? statementLines(context).length);
  return [
    withoutSections(input.mission, PLANNER_SECTIONS).trim(),
    '',
    OPEN_UNIT_HEADING,
    '',
    input.task === null
      ? 'No unit of work is open.'
      : `${quoted(input.task.label)} at ${input.task.url}${facets}`,
    ...statement,
  ].join('\n');
}

/** The evidence a field goal lists, under the legend of its kinds: none unless its composer brings it. */
type FieldGoalEvidence = Pick<FieldGoalInput, 'evidence' | 'kinds'>;

const NO_EVIDENCE: FieldGoalEvidence = { evidence: [], kinds: [] };

/** The goal with the first `shown` statement lines (every one for null), composed without a budget: the ladder measures it. */
const fieldGoalAt = (
  pipeline: FormPipeline,
  input: FieldsInput,
  shown: number | null,
  evidence: FieldGoalEvidence,
): string =>
  composeFieldGoal(
    {
      pipeline,
      prose: renderFieldProse(input, shown),
      fields: input.fields,
      evidence: evidence.evidence,
      kinds: evidence.kinds,
      ...(input.task === null ? {} : { unitKey: input.task.unitKey }),
    },
    Number.MAX_SAFE_INTEGER,
  );

export function composeFieldGoalWithinBudget(
  pipeline: FormPipeline,
  input: FieldsInput,
  budget = GOAL_BUDGET_BYTES,
  evidence: FieldGoalEvidence = NO_EVIDENCE,
): ComposedFieldGoal {
  const composed = (goal: string, rung: FieldGoalRung): ComposedFieldGoal => ({
    goal,
    rung,
    bytes: textBytes(goal),
    snapshotRung: null,
  });
  const whole = fieldGoalAt(pipeline, input, null, evidence);
  if (textBytes(whole) <= budget) return composed(whole, 'full');
  const context = input.task?.context ?? null;
  if (context === null) throw new GoalBudgetExceeded(textBytes(whole), budget);
  // The room the rest of the goal leaves, measured once with the title alone;
  // the whole lines that fit it follow, in document order, after the blank line
  // before them. The title's counts move by a few bytes with the cut, so the
  // fit is checked and the cut deepened until it holds.
  const bare = fieldGoalAt(pipeline, input, 0, evidence);
  let kept = firstThatFit(statementLines(context), budget - textBytes(bare) - 1).length;
  for (;;) {
    const goal = fieldGoalAt(pipeline, input, kept, evidence);
    if (textBytes(goal) <= budget) {
      return composed(goal, kept === 0 ? 'without-statement' : 'statement-cut');
    }
    if (kept === 0) throw new GoalBudgetExceeded(textBytes(goal), budget);
    kept -= 1;
  }
}
