/**
 * The index a tool-step goal carries for its validators: every tool with the
 * parameters a call is checked against, its effect and whether a person
 * approves it; whether anything has been observed yet; what ran at the last
 * step and how it ended; and the causes the mission declares. The composer
 * writes it as the goal's last fenced block, the validators read it back, and
 * a model is shown the goal without it — so it may hold numbers, which the
 * plan a model writes may not.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { STOP_CAUSE_MAX_LENGTH } from '../browser-session/mission-stops';
import { readFencedIndex } from '../quality-loop/goal-index';
import { canonicalArguments, parseArguments } from './arguments';
import type { ToolDeclaration } from './tool-definition';
import { CALLS_BOUND } from './tool-plan.schema';
import {
  CALL_OUTCOMES,
  TOOL_EFFECT_KINDS,
  TOOL_NAME_MAX_LENGTH,
  TOOL_STEP_PIPELINE_ID,
  type CallOutcome,
} from './vocab';

/** One call that ran at the last step, as the next plan is held to it: the same tool with the same arguments is a repeat. */
export interface RanCall {
  tool: string;
  argumentsJson: string;
  outcome: CallOutcome;
}

/**
 * What the last step did, as the next plan is told it: how many of its calls
 * ran, and each that ran with how it ended. Null before the first plan.
 */
export interface LastToolStep {
  ran: number;
  calls: readonly RanCall[];
}

/** The state as the step sees it: whether any call has been observed, and what the last step did. */
export interface ToolStepState {
  /** Whether at least one call's result is among the observations; nothing observed shows no stop condition. */
  observed: boolean;
  lastStep: LastToolStep | null;
}

/** The facts the validators check a plan against; everything else in the goal is for the model. */
export const toolIndexSchema = z.strictObject({
  pipeline: z.literal(TOOL_STEP_PIPELINE_ID),
  maxCalls: z.number().int().min(1),
  tools: z.array(
    z.strictObject({
      name: bounded.id(TOOL_NAME_MAX_LENGTH, { min: 1 }),
      parameters: z.record(z.string(), z.unknown()),
      effect: z.enum(TOOL_EFFECT_KINDS),
      approval: z.boolean().default(false),
    }),
  ),
  observed: z.boolean(),
  lastRan: bounded
    .list(
      CALLS_BOUND,
      z.strictObject({
        tool: bounded.id(TOOL_NAME_MAX_LENGTH, { min: 1 }),
        argumentsJson: z.string(),
        outcome: z.enum(CALL_OUTCOMES),
      }),
    )
    .default([]),
  causes: z.array(bounded.id(STOP_CAUSE_MAX_LENGTH, { min: 1 })).default([]),
});
export type ToolIndex = z.infer<typeof toolIndexSchema>;

/** A call's arguments in their canonical form where they parse, else as written. */
const canonical = (argumentsJson: string): string => {
  const parsed = parseArguments(argumentsJson);
  return parsed === null ? argumentsJson : canonicalArguments(parsed);
};

/** The index for this step: every fact a validator checks a plan against, the defaults left unwritten. */
export const toolIndexOf = (
  tools: readonly ToolDeclaration[],
  state: ToolStepState,
  causes: readonly string[],
): z.input<typeof toolIndexSchema> => ({
  pipeline: TOOL_STEP_PIPELINE_ID,
  maxCalls: CALLS_BOUND.target,
  tools: tools.map((tool) => ({
    name: tool.name,
    parameters: tool.parameters,
    effect: tool.effect,
    ...(tool.approval ? { approval: true } : {}),
  })),
  observed: state.observed,
  ...(state.lastStep !== null && state.lastStep.calls.length > 0
    ? {
        lastRan: state.lastStep.calls.slice(0, CALLS_BOUND.ceiling).map((call) => ({
          tool: call.tool,
          argumentsJson: canonical(call.argumentsJson),
          outcome: call.outcome,
        })),
      }
    : {}),
  ...(causes.length > 0 ? { causes: [...causes] } : {}),
});

/** The index this codec wrote, or null for a goal that is not a tool step. */
export const readToolIndex = (goal: string): ToolIndex | null =>
  readFencedIndex(goal, toolIndexSchema);
