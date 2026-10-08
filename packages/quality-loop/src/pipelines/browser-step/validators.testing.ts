import { formObservation, type StepPlan } from '@sysdesign/contracts';
import { contractOf } from '../../core/testing';
import { BROWSER_STEP } from './definition';
import { stepGoal } from './testing';
import { limitsValidator, referencesValidator } from './validators';

/** The two goals every validator spec reads a plan against, and both validators' problems with a plan. */
export const listing = stepGoal();
export const form = stepGoal(formObservation());

export const problems = (plan: StepPlan, goal = listing) => {
  const contract = contractOf(BROWSER_STEP.task, goal);
  return {
    references: referencesValidator.validate(plan, contract).problems,
    limits: limitsValidator.validate(plan, contract).problems,
  };
};
