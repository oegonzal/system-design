/**
 * A goal fitted to the engine's budget by declared rungs, never a cut
 * mid-section: every result whole; every result but the newest excerpted;
 * then the oldest observations left out and counted, until the newest alone
 * remains. The mission, the tools, the recent calls, the objections, the
 * progress, the limits and the index are never trimmed: a plan that could
 * not see its own rules would be refused for breaking them. Declared here
 * rather than in a program because two programs compose the same goal.
 */
import { GOAL_BUDGET_BYTES, GoalBudgetExceeded, textBytes } from '../quality-loop/goal-index';
import { excerpt } from '../text';
import { composeToolGoal, type ToolGoalInput, type ToolObservation } from './tool-goal';
import { OBSERVATION_EXCERPT_MAX_LENGTH } from './vocab';

export const TOOL_GOAL_RUNGS = ['full', 'observations-excerpted', 'fewer-observations'] as const;
export type ToolGoalRung = (typeof TOOL_GOAL_RUNGS)[number];

export interface ComposedToolGoal {
  goal: string;
  rung: ToolGoalRung;
  bytes: number;
  omittedObservations: number;
}

/** Every observation but the newest, excerpted; the newest is what this step reads first. */
const excerpted = (observations: readonly ToolObservation[]): ToolObservation[] =>
  observations.map((observation, position) =>
    position === observations.length - 1
      ? observation
      : { ...observation, result: excerpt(observation.result, OBSERVATION_EXCERPT_MAX_LENGTH) },
  );

/** The goal at a rung, or null when it does not fit. */
function attempt(input: ToolGoalInput, budget: number): string | null {
  try {
    return composeToolGoal(input, budget);
  } catch (error) {
    if (error instanceof GoalBudgetExceeded) return null;
    throw error;
  }
}

/**
 * The goal at the first rung it fits, with the rung and the count of
 * observations left out — or the budget refusal from the last rung, when the
 * newest observation alone would not fit.
 */
export function composeToolGoalWithinBudget(
  input: ToolGoalInput,
  budget = GOAL_BUDGET_BYTES,
): ComposedToolGoal {
  const full = attempt(input, budget);
  if (full !== null) {
    return {
      goal: full,
      rung: 'full',
      bytes: textBytes(full),
      omittedObservations: input.omittedObservations,
    };
  }
  const shortened = { ...input, observations: excerpted(input.observations) };
  const brief = attempt(shortened, budget);
  if (brief !== null) {
    return {
      goal: brief,
      rung: 'observations-excerpted',
      bytes: textBytes(brief),
      omittedObservations: input.omittedObservations,
    };
  }
  let kept = shortened.observations;
  for (;;) {
    kept = kept.slice(Math.ceil(kept.length / 2));
    const omitted = input.omittedObservations + shortened.observations.length - kept.length;
    const fewer = { ...shortened, observations: kept, omittedObservations: omitted };
    // With nothing left to leave out, the composer's own refusal is the answer.
    const goal = kept.length === 0 ? composeToolGoal(fewer, budget) : attempt(fewer, budget);
    if (goal !== null) {
      return {
        goal,
        rung: 'fewer-observations',
        bytes: textBytes(goal),
        omittedObservations: omitted,
      };
    }
  }
}
