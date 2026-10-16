/**
 * A tool plan read back: the one positional read-back of `lib/quality-loop`
 * over the tool session's plan — its calls addressed as `call.N`, and a plan
 * holding a part the effects table calls irrevocable (a finish, a call of an
 * irreversible tool) held to the accept bar. Which tool is irreversible is
 * read from the index the run's goal carries; a goal whose index cannot be
 * read counts every call irrevocable, the safe reading.
 */
import {
  routePositional,
  type PositionalPlan,
  type PositionalReadout,
} from '../quality-loop/read-back';
import type { QualityRunDto } from '../quality-loop/runs';
import { TOOL_EFFECTS } from './tool-effects';
import { readToolIndex, type ToolIndex } from './tool-index';
import { toolPlanSchema, type ToolPlan } from './tool-plan.schema';

/** Positional location ids the pipeline assigns and the session reads back. */
export const callLocation = (position: number): string => `call.${position + 1}`;
export const CALL_LOCATION = /^call\.(\d+)$/;

export type ToolPlanReadout = PositionalReadout<ToolPlan>;

/** Whether the plan holds a part no next observation can answer: a finish, or a call of a tool the index declares irreversible — or does not declare at all. */
export function irrevocableParts(plan: ToolPlan, index: ToolIndex | null): boolean {
  if (plan.finish !== null && TOOL_EFFECTS.finish.irrevocable) return true;
  return plan.calls.some((call) => {
    const tool = index?.tools.find((each) => each.name === call.tool);
    return tool === undefined ? true : TOOL_EFFECTS[tool.effect].irrevocable;
  });
}

/** How much of a tool plan the session runs; see `routePositional` for the rules. */
export function routeToolPlan(run: QualityRunDto, step: number): ToolPlanReadout {
  const index = readToolIndex(run.trace?.contract.goal ?? '');
  const shape: PositionalPlan<ToolPlan> = {
    schema: toolPlanSchema,
    grammar: CALL_LOCATION,
    locate: callLocation,
    units: (plan) => plan.calls.length,
    irrevocable: (plan) => irrevocableParts(plan, index),
  };
  return routePositional(run, step, shape);
}
