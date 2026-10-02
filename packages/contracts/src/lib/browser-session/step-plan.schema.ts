/**
 * A step plan: what the browser session does next on the page in front of it,
 * as the `browser-step` pipeline writes it. The model's one artifact per page
 * — a closed vocabulary of actions, each with its reason and what the page
 * should show after. Faces a model, so nothing here is a number: counts and
 * bounds are enforced by the pipeline's validators, which read the goal's
 * index.
 */
import { z } from 'zod';

import { ELEMENT_REF, URL_MAX } from './observation.schema';
import {
  PAGE_KINDS,
  PRESS_KEYS,
  SCROLL_DIRECTIONS,
  TASK_OUTCOMES,
  TERMINATE_CAUSES,
  WAIT_UNTIL,
} from './vocab';

export const MAX_ACTIONS = 8;
export const MAX_ASK_FIELDS = 40;
export const ASSESSMENT_MAX_LENGTH = 700;
export const ACTION_REASON_MAX_LENGTH = 240;
export const EXPECT_MAX_LENGTH = 200;
export const FILL_VALUE_MAX_LENGTH = 4000;
export const OPTION_VALUE_MAX_LENGTH = 200;
export const WAIT_VALUE_MAX_LENGTH = 500;
export const TASK_LABEL_MAX_LENGTH = 200;
export const DETAIL_MAX_LENGTH = 300;
export const SCREENSHOT_LABEL_MAX_LENGTH = 120;

const ref = z
  .string()
  .regex(ELEMENT_REF)
  .describe('An element ref exactly as the Elements list gives it, e.g. e12.');

const common = {
  reason: z
    .string()
    .min(1)
    .max(ACTION_REASON_MAX_LENGTH)
    .describe("Why this action, now, in the mission's own terms."),
  expect: z
    .string()
    .max(EXPECT_MAX_LENGTH)
    .nullable()
    .describe(
      'What the page should show once the action lands, or null when nothing visible changes.',
    ),
};

export const stepActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('navigate'), url: z.string().min(1).max(URL_MAX), ...common }),
  z.strictObject({ kind: z.literal('click'), ref, ...common }),
  z.strictObject({
    kind: z.literal('fill'),
    ref,
    value: z.string().max(FILL_VALUE_MAX_LENGTH).describe('The exact text to type.'),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('select'),
    ref,
    option: z
      .string()
      .min(1)
      .max(OPTION_VALUE_MAX_LENGTH)
      .describe('One of the options the Elements list gives for this ref, verbatim.'),
    ...common,
  }),
  z.strictObject({ kind: z.literal('press'), key: z.enum(PRESS_KEYS), ...common }),
  z.strictObject({
    kind: z.literal('scroll'),
    direction: z.enum(SCROLL_DIRECTIONS),
    ref: ref.nullable().describe('The element to scroll into view, or null to scroll the page.'),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('waitFor'),
    until: z.enum(WAIT_UNTIL),
    value: z
      .string()
      .min(1)
      .max(WAIT_VALUE_MAX_LENGTH)
      .describe('A listed ref for element, visible text for text, or a URL fragment for url.'),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('screenshot'),
    label: z.string().min(1).max(SCREENSHOT_LABEL_MAX_LENGTH),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('askFields'),
    refs: z
      .array(ref)
      .min(1)
      .max(MAX_ASK_FIELDS)
      .describe(
        'Form fields about the applicant; the field-answer pipeline answers them before the next action runs.',
      ),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('taskStart'),
    label: z
      .string()
      .min(1)
      .max(TASK_LABEL_MAX_LENGTH)
      .describe('The unit of work in the mission\'s terms, e.g. "Senior Engineer at Acme".'),
    url: z.string().min(1).max(URL_MAX),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('taskDone'),
    outcome: z.enum(TASK_OUTCOMES),
    detail: z.string().max(DETAIL_MAX_LENGTH),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('terminate'),
    cause: z.enum(TERMINATE_CAUSES).describe("The mission's stop condition this page shows."),
    detail: z.string().min(1).max(DETAIL_MAX_LENGTH),
    ...common,
  }),
  z
    .strictObject({
      kind: z.literal('done'),
      ...common,
    })
    .describe('Nothing is due on this page; the session re-observes.'),
]);
export type StepAction = z.infer<typeof stepActionSchema>;

export const stepPlanSchema = z.strictObject({
  pageKind: z.enum(PAGE_KINDS),
  assessment: z
    .string()
    .min(1)
    .max(ASSESSMENT_MAX_LENGTH)
    .describe(
      'What the page is, where the mission stands and what this plan does — two to four sentences.',
    ),
  actions: z
    .array(stepActionSchema)
    .min(1)
    .max(MAX_ACTIONS)
    .describe(
      'In the order they run, stopping at the next page transition. A taskDone, terminate or done action is last and appears nowhere else.',
    ),
});
export type StepPlan = z.infer<typeof stepPlanSchema>;

/** The refs an action acts on — the ones a validator checks against the page. */
export function actionRefs(action: StepAction): string[] {
  switch (action.kind) {
    case 'click':
    case 'fill':
    case 'select':
      return [action.ref];
    case 'scroll':
      return action.ref === null ? [] : [action.ref];
    case 'waitFor':
      return action.until === 'element' ? [action.value] : [];
    case 'askFields':
      return [...action.refs];
    default:
      return [];
  }
}
