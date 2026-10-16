import type { ToolPlan } from '@sysdesign/contracts';
import { contractOf } from '../../core/testing';
import { TOOL_STEP } from './definition';
import { observedGoal, toolGoal } from './testing';
import { limitsValidator, referencesValidator } from './validators';

/** The two goals every validator spec reads a plan against, and both validators' problems with a plan. */
export const first = toolGoal();
export const observed = observedGoal();

export const problems = (plan: ToolPlan, goal = observed) => {
  const contract = contractOf(TOOL_STEP.task, goal);
  return {
    references: referencesValidator.validate(plan, contract).problems,
    limits: limitsValidator.validate(plan, contract).problems,
  };
};
