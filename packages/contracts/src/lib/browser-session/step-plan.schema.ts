/**
 * A step plan: what the browser session does next on the page in front of it,
 * as the `browser-step` pipeline writes it. The model's one artifact per page
 * — a closed vocabulary of actions, each with its reason and what the page
 * should show after. Faces a model, so nothing here is a number: counts and
 * bounds are enforced by the pipeline's validators, which read the goal's
 * index.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { CRITERION_ID_MAX_LENGTH } from '../quality-loop/evidence';
import { ELEMENT_REF, TASK_LABEL_BOUND, URL_MAX_LENGTH } from './observation.schema';
import { PRESS_KEYS, SCROLL_DIRECTIONS, WAIT_UNTIL } from './action-effects';
import { TASK_OUTCOMES, TERMINATE_CAUSES } from './vocab';

export const ACTIONS_BOUND = bound(8, 'list');
export const ASK_FIELDS_BOUND = bound(40, 'list');
export const ASSESSMENT_BOUND = bound(700);
export const ACTION_REASON_BOUND = bound(240);
export const EXPECT_BOUND = bound(200);
export const FILL_VALUE_BOUND = bound(4000);
export const OPTION_VALUE_MAX_LENGTH = 200;
export const WAIT_VALUE_BOUND = bound(500);
export const DETAIL_BOUND = bound(300);
export const SCREENSHOT_LABEL_BOUND = bound(120);
/** The most criteria one action may say it serves: a step of a procedure, rarely two. */
export const SERVES_BOUND = bound(4, 'list');

const ref = z
  .string()
  .regex(ELEMENT_REF)
  .describe('An element ref exactly as the Elements list gives it, e.g. e12.');

const url = () => bounded.id(URL_MAX_LENGTH, { min: 1 });

const common = {
  reason: bounded.text(ACTION_REASON_BOUND, {
    min: 1,
    description: "Why this action, now, in the mission's own terms.",
  }),
  expect: bounded
    .text(EXPECT_BOUND, {
      description:
        'What the page should show once the action lands, or null when nothing visible changes.',
    })
    .nullable(),
  /**
   * What the session settles a passed criterion on: the action that said it
   * served it ran, and the page moved. Measured 2026-10-07: a plan's last
   * click timed out after its first click had opened the listing, and the
   * criteria that click had earned were failed on nine pages after. Required
   * and empty when the action serves none: a strict endpoint refuses a schema
   * with an optional property, and did, on every call of a twelve-step session.
   */
  serves: bounded.list(SERVES_BOUND, bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 }), {
    description:
      'The procedure criteria this action is taken for, by id as the checklist lists them (c5); an empty list when it serves none.',
  }),
};

export const stepActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('navigate'), url: url(), ...common }),
  z.strictObject({ kind: z.literal('click'), ref, ...common }),
  z.strictObject({
    kind: z.literal('fill'),
    ref,
    value: bounded.text(FILL_VALUE_BOUND, { description: 'The exact text to type.' }),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('select'),
    ref,
    option: bounded.id(OPTION_VALUE_MAX_LENGTH, {
      min: 1,
      description: 'One of the options the Elements list gives for this ref, verbatim.',
    }),
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
    value: bounded.text(WAIT_VALUE_BOUND, {
      min: 1,
      description: 'A listed ref for element, visible text for text, or a URL fragment for url.',
    }),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('screenshot'),
    label: bounded.text(SCREENSHOT_LABEL_BOUND, { min: 1 }),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('askFields'),
    refs: bounded.list(ASK_FIELDS_BOUND, ref, {
      min: 1,
      description:
        'Form fields about the applicant; the field-answer pipeline answers them before the next action runs.',
    }),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('taskStart'),
    label: bounded.text(TASK_LABEL_BOUND, {
      min: 1,
      description: 'The unit of work in the mission\'s terms, e.g. "Senior Engineer at Acme".',
    }),
    url: url(),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('taskDone'),
    outcome: z.enum(TASK_OUTCOMES),
    detail: bounded.text(DETAIL_BOUND),
    ...common,
  }),
  z.strictObject({
    kind: z.literal('terminate'),
    cause: z.enum(TERMINATE_CAUSES).describe("The mission's stop condition this page shows."),
    detail: bounded.text(DETAIL_BOUND, { min: 1 }),
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
  assessment: bounded.text(ASSESSMENT_BOUND, {
    min: 1,
    description:
      'What the page is, where the mission stands and what this plan does — two to four sentences.',
  }),
  actions: bounded.list(ACTIONS_BOUND, stepActionSchema, {
    min: 1,
    description:
      'In the order they run, stopping at the next page transition. A terminate or done action is last and appears nowhere else; a taskStart or taskDone comes before any action that could change the page.',
  }),
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
