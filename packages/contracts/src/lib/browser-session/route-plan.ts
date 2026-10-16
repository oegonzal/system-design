/**
 * A step plan read back: the one positional read-back of `lib/quality-loop`
 * over the browser session's plan — its actions addressed as `action.N`, and
 * a plan carrying an action that ends the session (`ActionEffects.endsSession`,
 * the one move no next page can answer) held to the accept bar.
 */
import {
  routePositional,
  type PositionalPlan,
  type PositionalReadout,
} from '../quality-loop/read-back';
import type { QualityRunDto } from '../quality-loop/runs';
import { ACTION_EFFECTS } from './action-effects';
import { ACTION_LOCATION, actionLocation } from './pipelines';
import { stepPlanSchema, type StepPlan } from './step-plan.schema';

export type PlanReadout = PositionalReadout<StepPlan>;

const STEP_PLAN: PositionalPlan<StepPlan> = {
  schema: stepPlanSchema,
  grammar: ACTION_LOCATION,
  locate: actionLocation,
  units: (plan) => plan.actions.length,
  irrevocable: (plan) => plan.actions.some((action) => ACTION_EFFECTS[action.kind].endsSession),
};

/** How much of a step plan the session runs; see `routePositional` for the rules. */
export const routePlan = (run: QualityRunDto, step: number): PlanReadout =>
  routePositional(run, step, STEP_PLAN);
