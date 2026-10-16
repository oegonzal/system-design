/**
 * The Limits a tool-step goal states: what the validators refuse, said to the
 * model as rules. One declared list rendered in order; a line about the
 * mission's causes, an unobserved step, a cut repeat or the steps left
 * appears only when it applies.
 */
import { quoted } from '../text';
import type { RanCall } from './tool-index';
import { CALLS_BOUND } from './tool-plan.schema';
import { CALL_OUTCOME_REPEATS } from './vocab';

/** What the mission declared, and what the step holds, that a Limits line may depend on. */
export interface ToolLimitFacts {
  /** Every cause the mission's Stop conditions declare. */
  causes: readonly string[];
  observed: boolean;
  lastRan: readonly RanCall[];
  /** The tools a person approves each call of, by name. */
  approvalTools: readonly string[];
  stepsLeft: number;
}

interface Limit {
  /** Absent for a line every goal carries. */
  when?: (facts: ToolLimitFacts) => boolean;
  line: (facts: ToolLimitFacts) => string;
}

const cutRepeats = (facts: ToolLimitFacts): RanCall[] =>
  facts.lastRan.filter((call) => CALL_OUTCOME_REPEATS[call.outcome] === 'cut');

const TOOL_LIMITS: readonly Limit[] = [
  // A cap reads as a quota unless it says otherwise: measured on browser
  // plans, asked for "at most 8", a producer returned seven or eight nearly
  // every time. Saying it is a ceiling costs five words.
  {
    line: () =>
      `- At most ${CALLS_BOUND.target} calls, in the order they run — a ceiling the validators enforce, never a number to reach.`,
  },
  {
    line: () =>
      "- Name tools only from the Tools list above, exactly as written, and give each call's arguments as one JSON object of the parameters the tool declares — every required one present, each of its declared type. A call naming another tool, or arguments that do not fit, is cut.",
  },
  {
    line: (facts) =>
      `- A call whose effect is irreversible${
        facts.approvalTools.length === 0
          ? ''
          : `, or one that waits for the operator's approval (${facts.approvalTools.join(', ')})`
      }, is the LAST call of the plan: what follows it would be planned on an outcome nobody has seen. Plan up to it and leave what its observation shows to the next plan.`,
  },
  {
    line: () =>
      '- A plan is calls, or one question (ask), or a finish — never two of these: an ask or a finish claims what the observations show as they stand, so no call stands beside it.',
  },
  {
    when: (facts) => facts.causes.length > 0,
    line: (facts) =>
      `- A finish names one of the stop conditions the mission declares — ${facts.causes.join(', ')} — and nothing else; a finish for a cause the observations do not show is a wrong claim.`,
  },
  {
    when: (facts) => !facts.observed,
    line: () =>
      '- No finish is possible on this step: nothing has been observed yet, so no stop condition is shown to rest it on.',
  },
  {
    when: (facts) => cutRepeats(facts).length > 0,
    line: (facts) =>
      `- Repeating a call that failed or was refused at the last step with the same arguments is cut: ${cutRepeats(
        facts,
      )
        .map((call) => `${call.tool} ${quoted(call.argumentsJson)} (${call.outcome})`)
        .join('; ')}. Change what was wrong, use another tool, or ask.`,
  },
  {
    line: (facts) =>
      `- ${facts.stepsLeft} step${facts.stepsLeft === 1 ? '' : 's'} remain in this session's budget, this one included.`,
  },
];

/** The Limits lines for this step, in declared order. */
export const toolLimitsLines = (facts: ToolLimitFacts): string[] =>
  TOOL_LIMITS.filter((limit) => limit.when?.(facts) ?? true).map((limit) => limit.line(facts));
