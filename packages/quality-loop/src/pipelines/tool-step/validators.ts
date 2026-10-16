/**
 * The exact checks on a tool plan: what the goal's index says against what the
 * plan does. A plan that names a tool the index does not list, runs past the
 * call ceiling, goes on past a call whose outcome must be seen first, sends
 * arguments that do not fit the tool's declared parameters, repeats a call the
 * tool refused or failed with the same arguments, puts a question or a finish
 * beside a call or beside each other, finishes on a cause the mission did not
 * declare or before anything was observed, or plans nothing, is refused from
 * that part on.
 *
 * Both validators CUT rather than block: a plan's calls run in order, so a
 * fault at call.3 says nothing against call.1 and call.2, which were planned
 * against the observations the session has. A fault at the question, the
 * finish or the assessment sits outside the call grammar, so the read-back
 * refuses the plan whole — a wrong closer is a wrong reading of the
 * observations. The lenses still judge the whole plan with these problems
 * already counted.
 *
 * Nothing here reads prose: every fact is in the index the session wrote.
 */
import {
  argumentFaults,
  CALL_OUTCOME_REPEATS,
  callLocation,
  parseArguments,
  sameArguments,
  TOOL_EFFECTS,
  type ToolCall,
  type ToolIndex,
  type ToolPlan,
  type ValidationProblem,
} from '@sysdesign/contracts';

import {
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  problem,
  REFERENCES_VALIDATOR_ID,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { TOOL_STEP_PIPELINE_ID, readIndex } from './input';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<ToolPlan, ToolIndex>;
type IndexedTool = ToolIndex['tools'][number];

/** Every tool a call names is one the index lists; located at the call, so the session stops before it. */
const references: Rule = (plan, index) => {
  const known = new Set(index.tools.map((tool) => tool.name));
  return plan.calls.flatMap((call, position) =>
    known.has(call.tool)
      ? []
      : [problem('critical', `${call.tool} is not a listed tool`, [callLocation(position)])],
  );
};

/**
 * Whether a call ends the plan: its tool's declared effect is terminal, or a
 * person approves the call before it runs — either way its outcome has not
 * been seen when the next call would be chosen.
 */
const endsPlan = (tool: IndexedTool): boolean =>
  TOOL_EFFECTS[tool.effect].terminal || tool.approval;

/** The words for why a call ends the plan, for the call that follows it. */
const endingWord = (tool: IndexedTool): string => (tool.approval ? 'approval-gated' : tool.effect);

/** What one call's arguments fail of the tool's declared parameters: not one object, or the faults the shallow reading finds. */
function argumentProblems(call: ToolCall, tool: IndexedTool): string[] {
  const args = parseArguments(call.argumentsJson);
  if (args === null) return ['arguments are not one JSON object'];
  return argumentFaults(args, tool.parameters).map((fault) => fault.message);
}

/**
 * A call that ran at the last step and failed or was refused, sent again with
 * the same arguments, asks the tool the question it has already answered no
 * to. Measured on browser plans, 2026-10-08: nine of 31 steps were one click
 * on one already-selected card, repeated.
 */
const repeatFault = (call: ToolCall, index: ToolIndex): string | null => {
  const repeated = index.lastRan.find(
    (ran) =>
      ran.tool === call.tool &&
      CALL_OUTCOME_REPEATS[ran.outcome] === 'cut' &&
      sameArguments(ran.argumentsJson, call.argumentsJson),
  );
  if (repeated === undefined) return null;
  return `${call.tool} ran at the last step with these arguments and ${
    repeated.outcome === 'failed' ? 'failed' : 'was refused'
  }: repeating it is cut — change the arguments, use another tool, or ask`;
};

/** The problems of the calls, in order: the ceiling, a call past an ending one, its arguments, a cut repeat. */
function callProblems(plan: ToolPlan, index: ToolIndex): ValidationProblem[] {
  const tools = new Map(index.tools.map((tool) => [tool.name, tool]));
  const problems: ValidationProblem[] = [];
  // Located at the first call past the limit, so the plan is cut there and
  // the calls within the limit still run: a limit never discards work.
  if (plan.calls.length > index.maxCalls) {
    problems.push(
      problem('high', `${plan.calls.length} calls planned; the limit is ${index.maxCalls}`, [
        callLocation(index.maxCalls),
      ]),
    );
  }
  /** The first call that ends the plan, once one has. */
  let ended: { position: number; tool: IndexedTool } | null = null;
  plan.calls.forEach((call, position) => {
    const at = [callLocation(position)];
    const tool = tools.get(call.tool);
    if (ended !== null) {
      problems.push(
        problem(
          'high',
          `${call.tool} follows the ${endingWord(ended.tool)} ${ended.tool.name} at ${callLocation(ended.position)}: the outcome it would be planned on has not been observed`,
          at,
        ),
      );
    }
    // An unlisted tool is the references rule's to report; nothing else can be said of it.
    if (tool === undefined) return;
    for (const message of argumentProblems(call, tool)) problems.push(problem('high', message, at));
    const repeat = repeatFault(call, index);
    if (repeat !== null) problems.push(problem('high', repeat, at));
    if (ended === null && endsPlan(tool)) ended = { position, tool };
  });
  return problems;
}

/**
 * The problems of the closers: a question and a finish together, either
 * beside a call, a finish for a cause the mission never declared or on a
 * step where nothing has been observed, and a plan that does nothing at all.
 * Each sits at the closer, outside the call grammar, so the read-back refuses
 * the plan whole: the closer claims what the observations show, and a wrong
 * claim is a wrong reading.
 */
function closerProblems(plan: ToolPlan, index: ToolIndex): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  if (plan.ask !== null && plan.finish !== null) {
    problems.push(problem('high', 'a plan ends on a question or a finish, not both', ['finish']));
  }
  for (const closer of ['ask', 'finish'] as const) {
    if (plan[closer] !== null && TOOL_EFFECTS[closer].claims && plan.calls.length > 0) {
      problems.push(
        problem(
          'high',
          `${closer === 'ask' ? 'a question' : 'a finish'} ends a plan alone: it claims what the observations show as they stand — drop the calls, or ${closer} once they have run`,
          [closer],
        ),
      );
    }
  }
  if (plan.finish !== null) {
    if (!index.causes.includes(plan.finish.cause)) {
      problems.push(
        problem(
          'high',
          `finish ${plan.finish.cause}: the mission declares no such stop condition — it declares ${index.causes.join(', ') || 'none'}`,
          ['finish'],
        ),
      );
    }
    if (!index.observed) {
      problems.push(
        problem(
          'high',
          'finish on nothing observed: no stop condition is shown to rest it on — call a tool first',
          ['finish'],
        ),
      );
    }
  }
  if (plan.calls.length === 0 && plan.ask === null && plan.finish === null) {
    problems.push(
      problem('high', 'the plan does nothing: plan a call, ask, or finish', ['assessment']),
    );
  }
  return problems;
}

const limits: Rule = (plan, index) => [
  ...callProblems(plan, index),
  ...closerProblems(plan, index),
];

export const referencesValidator: Validator<ToolPlan> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${TOOL_STEP_PIPELINE_ID} index`)],
  'cut',
);

export const limitsValidator: Validator<ToolPlan> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
  'cut',
);
