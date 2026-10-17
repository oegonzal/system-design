/**
 * The plan a tool-step producer answers with, as the model sees it: strict,
 * every key present, no number anywhere — a tool's arguments travel as one
 * JSON object in a string, which the limits validator parses against the
 * tool's declared parameters from the goal's index. A plan is calls, or one
 * question, or a finish; the rule is the validator's, so a model that
 * breaks it is told at the part that broke it rather than refused by the
 * schema with no word of why.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { STOP_CAUSE_MAX_LENGTH } from '../browser-session/mission-stops';
import { CRITERION_ID_MAX_LENGTH } from '../quality-loop/evidence';
import { TOOL_NAME_MAX_LENGTH } from './vocab';

export const CALLS_BOUND = bound(8, 'list');
export const TOOL_ASSESSMENT_BOUND = bound(900);
export const CALL_REASON_BOUND = bound(240);
export const CALL_EXPECT_BOUND = bound(200);
export const CALL_SERVES_BOUND = bound(4, 'list');
export const ARGUMENTS_BOUND = bound(4000);
export const ASK_QUESTION_BOUND = bound(160);
export const ASK_OPTION_BOUND = bound(200);
export const ASK_OPTIONS_BOUND = bound(8, 'list');
export const FINISH_DETAIL_BOUND = bound(600);

export const toolCallSchema = z.strictObject({
  tool: bounded.id(TOOL_NAME_MAX_LENGTH, {
    min: 1,
    description: 'A tool name exactly as the Tools list gives it.',
  }),
  argumentsJson: bounded.text(ARGUMENTS_BOUND, {
    min: 2,
    description:
      'One JSON object holding only the parameters the tool declares, every required one present, each of its declared type.',
  }),
  reason: bounded.text(CALL_REASON_BOUND, {
    min: 1,
    description: "Why this call, now, in the mission's own terms.",
  }),
  expect: bounded
    .text(CALL_EXPECT_BOUND, {
      description: 'What its observation should show, or null when nothing in particular.',
    })
    .nullable(),
  serves: bounded.list(CALL_SERVES_BOUND, bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 }), {
    description:
      'The checklist criteria this call is taken for, by id as the checklist lists them (c5); an empty list when it serves none.',
  }),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const askSchema = z.strictObject({
  question: bounded.text(ASK_QUESTION_BOUND, {
    min: 1,
    description: "The one question only the operator can answer, in the mission's terms.",
  }),
  options: bounded.list(ASK_OPTIONS_BOUND, bounded.text(ASK_OPTION_BOUND, { min: 1 }), {
    description:
      'The answers to choose from, where the observations offer them; an empty list for a free answer.',
  }),
});
export type Ask = z.infer<typeof askSchema>;

export const finishSchema = z.strictObject({
  cause: bounded.id(STOP_CAUSE_MAX_LENGTH, {
    min: 1,
    description:
      "The cause word of the mission's stop condition the observations show, as its Stop conditions declare it.",
  }),
  detail: bounded.text(FINISH_DETAIL_BOUND, {
    min: 1,
    description: 'What was observed that shows it.',
  }),
});
export type Finish = z.infer<typeof finishSchema>;

export const toolPlanSchema = z.strictObject({
  assessment: bounded.text(TOOL_ASSESSMENT_BOUND, {
    min: 1,
    description:
      'What the observations show, where the mission stands and what this plan does — two to four sentences.',
  }),
  calls: bounded.list(CALLS_BOUND, toolCallSchema, {
    description:
      'In the order they run, up to the first whose outcome must be seen before the next is chosen; empty when the plan asks or finishes.',
  }),
  ask: askSchema.nullable(),
  finish: finishSchema.nullable(),
});
export type ToolPlan = z.infer<typeof toolPlanSchema>;
