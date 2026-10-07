import {
  composeStepGoal,
  GOAL_BUDGET_BYTES,
  GoalBudgetExceeded,
  textBytes,
  type PageObservation,
  type StepGoalInput,
} from '@sysdesign/contracts';

import type { FieldsInput, GoalComposition } from '../../core/ports';
import { quote } from '../../core/text';
// The snapshot's own codec, not a browser: it reduces snapshot text by the
// declared rungs and never touches a page.
import { fitSnapshot } from '../playwright/aria-snapshot';

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
  // The open scope is kept whole and the page behind it reduced first: the
  // dialog's lines are what the plan acts on.
  const fitted = fitSnapshot(observation.ariaSnapshot, room, observation.activeScope);
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
  input: StepGoalInput,
  budget = GOAL_BUDGET_BYTES,
): ComposedGoal {
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

/** The prose half of a field-answer goal: the mission verbatim, and the unit of work the fields belong to. */
export function renderFieldProse(input: Pick<FieldsInput, 'mission' | 'task'>): string {
  return [
    '# Mission',
    '',
    input.mission.trim(),
    '',
    '## Open unit of work',
    '',
    input.task === null
      ? 'No unit of work is open.'
      : `${quote(input.task.label)} at ${input.task.url}`,
  ].join('\n');
}
