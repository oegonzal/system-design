/**
 * A step plan as the lenses read it: the assessment, then every action by its
 * position. Ids are positional and engine-assigned (`action.3`), never
 * anything the model wrote, and the render prints each one beside the ref the
 * action acts on, so a finding located at `action.3` is a finding about one
 * element on one page. The schema is the contract's — the session reads the
 * accepted plan back with the same one.
 */
import { stepPlanSchema, type StepAction, type StepPlan } from '@sysdesign/contracts';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

const quote = (text: string): string => JSON.stringify(text);

/** What an action does, in the plan's closed vocabulary: the kind, then what it acts on. */
export function describeAction(action: StepAction): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate ${action.url}`;
    case 'click':
      return `click ${action.ref}`;
    case 'fill':
      return `fill ${action.ref} with ${quote(action.value)}`;
    case 'select':
      return `select ${quote(action.option)} on ${action.ref}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}${action.ref === null ? '' : ` to ${action.ref}`}`;
    case 'waitFor':
      return `waitFor ${action.until} ${quote(action.value)}`;
    case 'screenshot':
      return `screenshot ${quote(action.label)}`;
    case 'askFields':
      return `askFields ${action.refs.join(', ')}`;
    case 'taskStart':
      return `taskStart ${quote(action.label)} at ${action.url}`;
    case 'taskDone':
      return `taskDone ${action.outcome}${action.detail.length > 0 ? ` — ${action.detail}` : ''}`;
    case 'terminate':
      return `terminate ${action.cause} — ${action.detail}`;
    case 'done':
      return 'done';
  }
}

/** `click e12 — reason — expect: …`: the action, why, and what the page should show after. */
const actionLine = (action: StepAction): string =>
  `${describeAction(action)} — ${action.reason}${action.expect === null ? '' : ` — expect: ${action.expect}`}`;

export const stepPlanOutput: OutputShape<StepPlan> = {
  schema: stepPlanSchema,

  locate: (plan) => [
    { id: 'assessment', label: 'Assessment' },
    ...numbered('action', plan.actions, describeAction),
  ],

  render: (plan) =>
    [
      `[assessment] ${plan.pageKind} — ${plan.assessment}`,
      ...numberedSection('Actions', 'action', plan.actions, actionLine),
    ].join('\n'),
};
