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

/** The goal composed at one rung, or null when it does not fit. */
function attempt(
  input: StepGoalInput,
  observation: PageObservation,
  rung: GoalRung,
  budget: number,
): ComposedGoal | null {
  try {
    const goal = composeStepGoal({ ...input, observation }, budget);
    return { goal, rung, bytes: textBytes(goal), omittedElements: observation.omittedElements };
  } catch (error) {
    if (error instanceof GoalBudgetExceeded) return null;
    throw error;
  }
}

export function composeStepGoalWithinBudget(
  input: StepGoalInput,
  budget = GOAL_BUDGET_BYTES,
): ComposedGoal {
  const full = input.observation;
  const trimmed = trimmedContext(full);
  const fitted =
    attempt(input, full, 'full', budget) ??
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
