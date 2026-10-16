/**
 * A tool plan as the lenses read it: the assessment, then every call by its
 * position, then the question or the finish the plan ends on. Ids are
 * positional and engine-assigned (`call.3`, `ask`, `finish`), never anything
 * the model wrote, and the render prints each one beside the tool and the
 * arguments the call sends, so a finding located at `call.3` is a finding
 * about one call. The schema is the contract's — the session reads the
 * accepted plan back with the same one.
 */
import { callLabel, toolPlanSchema, type ToolCall, type ToolPlan } from '@sysdesign/contracts';

import { numbered, numberedSection, section, type OutputShape } from '../../core/contracts';

/** What a call does, in the plan's own terms: the tool, then the arguments it sends. */
export const describeCall = (call: ToolCall): string => callLabel(call.tool, call.argumentsJson);

/** `list_items "{…}" — reason — expect: … — serves: c5`: the call, why, what its observation should show, and the criteria it claims. */
const callLine = (call: ToolCall): string =>
  `${describeCall(call)} — ${call.reason}${call.expect === null ? '' : ` — expect: ${call.expect}`}${
    call.serves.length === 0 ? '' : ` — serves: ${call.serves.join(', ')}`
  }`;

const askLabel = (plan: ToolPlan): string[] =>
  plan.ask === null
    ? []
    : [
        `[ask] ${plan.ask.question}${
          plan.ask.options.length === 0 ? '' : ` — options: ${plan.ask.options.join(' | ')}`
        }`,
      ];

const finishLabel = (plan: ToolPlan): string[] =>
  plan.finish === null ? [] : [`[finish] ${plan.finish.cause} — ${plan.finish.detail}`];

export const toolPlanOutput: OutputShape<ToolPlan> = {
  schema: toolPlanSchema,

  locate: (plan) => [
    { id: 'assessment', label: 'Assessment' },
    ...numbered('call', plan.calls, describeCall),
    ...(plan.ask === null
      ? []
      : [{ id: 'ask', label: `ask ${JSON.stringify(plan.ask.question)}` }]),
    ...(plan.finish === null ? [] : [{ id: 'finish', label: `finish ${plan.finish.cause}` }]),
  ],

  render: (plan) =>
    [
      `[assessment] ${plan.assessment}`,
      ...numberedSection('Calls', 'call', plan.calls, callLine),
      ...section('Ask', askLabel(plan)),
      ...section('Finish', finishLabel(plan)),
    ].join('\n'),
};
