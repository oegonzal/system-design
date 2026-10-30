/**
 * A step plan as the lenses read it: the assessment, then every action by its
 * position. Ids are positional and engine-assigned (`action.3`), never
 * anything the model wrote, and the render prints each one beside the ref the
 * action acts on, so a finding located at `action.3` is a finding about one
 * element on one page. The schema is the contract's — the session reads the
 * accepted plan back with the same one.
 */
import {
  ON_RECORD_TAKEN,
  stepPlanSchema,
  type StepAction,
  type StepPlan,
  quotedJson,
} from '@sysdesign/contracts';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

/** What an action does, in the plan's closed vocabulary: the kind, then what it acts on. */
export function describeAction(action: StepAction): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate ${action.url}`;
    case 'click':
      return `click ${action.ref}`;
    case 'fill':
      return `fill ${action.ref} with ${quotedJson(action.value)}`;
    case 'select':
      return `select ${quotedJson(action.option)} on ${action.ref}`;
    case 'upload':
      return `upload ${quotedJson(action.document)} into ${action.ref}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}${action.ref === null ? '' : ` to ${action.ref}`}`;
    case 'waitFor':
      return `waitFor ${action.until} ${quotedJson(action.value)}`;
    case 'screenshot':
      return `screenshot ${quotedJson(action.label)}`;
    case 'askFields':
      return `askFields ${action.refs.join(', ')}`;
    case 'taskStart':
      // The identity the validator holds the claim to, and the declaration the
      // session holds it to against the record, printed so the judges grade
      // what the engines check.
      return `taskStart ${quotedJson(action.label)} at ${action.url}${action.facets
        .map((facet) => ` · ${facet.name}=${quotedJson(facet.value)}`)
        .join('')}${action[ON_RECORD_TAKEN] === true ? ` · ${ON_RECORD_TAKEN}` : ''}`;
    case 'taskDone':
      return `taskDone ${action.outcome}${action.detail.length > 0 ? ` — ${action.detail}` : ''}`;
    case 'terminate':
      return `terminate ${action.cause} — ${action.detail}`;
    case 'done':
      return 'done';
  }
}

/** `click e12 — reason — expect: … — serves: c5`: the action, why, what the page should show after, and the criteria it claims. */
const actionLine = (action: StepAction): string =>
  `${describeAction(action)} — ${action.reason}${action.expect === null ? '' : ` — expect: ${action.expect}`}${
    action.serves.length === 0 ? '' : ` — serves: ${action.serves.join(', ')}`
  }`;

export const stepPlanOutput: OutputShape<StepPlan> = {
  schema: stepPlanSchema,

  locate: (plan) => [
    { id: 'assessment', label: 'Assessment' },
    ...numbered('action', plan.actions, describeAction),
  ],

  render: (plan) =>
    [
      `[assessment] ${plan.assessment}`,
      ...numberedSection('Actions', 'action', plan.actions, actionLine),
    ].join('\n'),
};
