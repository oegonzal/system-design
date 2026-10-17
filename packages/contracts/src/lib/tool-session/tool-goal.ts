/**
 * The goal codec of the `tool-step` pipeline. A tool session composes one
 * goal per step — the mission verbatim, the tools it may call, what earlier
 * calls returned, what was just done, what the plans before were refused for
 * and where the mission stands — and the pipeline's validators read the
 * bookkeeping back from the last fenced block. Nothing here parses prose:
 * every fact a validator needs is in the index.
 */
import type { SuccessCriterion } from '../quality-loop/evidence';
import { GOAL_BUDGET_BYTES, renderIndexSection, withinBudget } from '../quality-loop/goal-index';
import { objectionLines, type Objection } from '../quality-loop/read-back';
import { stopsOf } from '../browser-session/mission-stops';
import { quoted } from '../text';
import { localTimeOf } from '../time-zone';
import { renderToolLines, type ToolDeclaration } from './tool-definition';
import { toolIndexOf, type ToolStepState } from './tool-index';
import { toolLimitsLines } from './tool-limits';
import type { CallOutcome } from './vocab';

/** One call's result as the plans after it read it: which call, at which step, how it ended, and what it returned. */
export interface ToolObservation {
  step: number;
  tool: string;
  argumentsJson: string;
  outcome: CallOutcome;
  result: string;
}

/** One recent call as the next plan is told of it: a call that did not run leads with that fact. */
export interface CallHistoryEntry {
  /** The call as it reads: the tool and its arguments. */
  call: string;
  outcome: CallOutcome;
  note: string | null;
}

/** Where the mission stands, as engine facts: the session's whole rubric, and the criteria settled for the rest of it. */
export interface ToolProgress {
  criteria: readonly SuccessCriterion[];
  settled: readonly string[];
}

export interface ToolGoalInput extends ToolStepState {
  /** The goal document, verbatim. */
  mission: string;
  /** The instant the goal is composed at, as ISO 8601: a plan over instants has one to count from. */
  now: string;
  /** The operator's IANA time zone: the frame "today" and "tomorrow" in a mission are read in. */
  timeZone: string;
  tools: readonly ToolDeclaration[];
  /** Oldest first; the fit may leave the oldest out and count them. */
  observations: readonly ToolObservation[];
  /** How many earlier observations the fit left out, so the goal never reads as the whole record. */
  omittedObservations: number;
  /** Most recent last. */
  history: readonly CallHistoryEntry[];
  /** Why the plans before this one did not run, newest first — what the next plan has to answer. */
  objections: readonly Objection[];
  progress: ToolProgress;
  /** How many steps the session may still take, this one included. */
  stepsLeft: number;
}

const OBJECTION_WORDING = {
  none: '(none — no plan made at this step has been refused)',
  heading: 'Why the plans made at this step did not run, or were cut, newest first:',
};

/** A heading, a blank line, the lines, a blank line: the shape every section of the goal has. */
const section = (heading: string, lines: readonly string[]): string[] => [
  heading,
  '',
  ...lines,
  '',
];

/** The tools by the program that runs them: one program unheaded, several each under its own line. */
function toolLines(tools: readonly ToolDeclaration[]): string[] {
  if (tools.length === 0) return ['(no tools declared)'];
  const providers = [...new Set(tools.map((tool) => tool.provider))];
  if (providers.length === 1) return tools.flatMap(renderToolLines);
  return providers.flatMap((provider) => [
    `From ${provider}:`,
    ...tools.filter((tool) => tool.provider === provider).flatMap(renderToolLines),
  ]);
}

/** Each observation under its own heading: which call, at which step, how it ended, then what it returned. */
function observationLines(input: ToolGoalInput): string[] {
  const { observations, omittedObservations } = input;
  if (observations.length === 0 && omittedObservations === 0) {
    return ['(none yet — no call has run)'];
  }
  return [
    ...(omittedObservations > 0 ? [`(${omittedObservations} earlier observations not shown)`] : []),
    ...observations.flatMap((observation, position) => [
      `### Observation ${omittedObservations + position + 1} — ${observation.tool} ${observation.argumentsJson} · step ${observation.step} · ${observation.outcome}`,
      observation.result.trim() === '' ? '(empty result)' : observation.result,
      '',
    ]),
  ];
}

/**
 * The recent calls, one line each. An entry that ran reads call first; one
 * that did not leads with that fact, so a proposal the session never carried
 * out cannot be read as something that happened.
 */
const historyLines = (history: readonly CallHistoryEntry[]): string[] =>
  history.length === 0
    ? ['(none yet)']
    : history.map((entry) => {
        const note = entry.note === null ? '' : ` — ${entry.note}`;
        return entry.outcome === 'not-executed'
          ? `- not-executed (proposed, did not run): ${entry.call}${note}`
          : `- ${entry.call} — ${entry.outcome}${note}`;
      });

/** Where the mission stands: the settled criteria with their statements, and the rest by id. */
function progressLines(progress: ToolProgress): string[] {
  const settled = progress.criteria.filter((criterion) => progress.settled.includes(criterion.id));
  const open = progress.criteria.filter((criterion) => !progress.settled.includes(criterion.id));
  return [
    ...(settled.length === 0
      ? ['- Satisfied earlier this session: none yet.']
      : [
          '- Satisfied earlier this session, not graded at this step:',
          ...settled.map((criterion) => `  - ${criterion.id} — ${criterion.statement}`),
        ]),
    `- Still open: ${open.length === 0 ? 'none' : open.map((criterion) => criterion.id).join(', ')}.`,
  ];
}

/**
 * When the plan is made, as the operator's clock shows it and in UTC: a
 * mission's "today", "tomorrow" and "this week" are the operator's, and a
 * day boundary in UTC is not one in their zone.
 */
const nowLines = (now: string, timeZone: string): string[] => {
  const local = localTimeOf(new Date(now), timeZone);
  return [
    `It is ${local.weekday} ${local.date} ${local.time} in ${timeZone} (${local.offset}), which is ${now} in UTC.`,
    `Read "today", "tomorrow" and "this week" in ${timeZone}. An instant a tool takes is ISO 8601 with its offset; a tool that works in a time zone of its own says so in its description.`,
  ];
};

/** A call as a label names it — a history line, a location a judge cites: the tool and its arguments, quoted. */
export const callLabel = (tool: string, argumentsJson: string): string =>
  `${tool} ${quoted(argumentsJson)}`;

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeToolGoal(input: ToolGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const causes = [...new Set(stopsOf(input.mission).map((stop) => stop.cause))];
  const lastRan = input.lastStep?.calls ?? [];
  const goal = [
    // The mission brings its own heading — the template requires its `# Mission` — so the
    // goal never doubles it.
    input.mission.trim(),
    '',
    ...section('## Now', nowLines(input.now, input.timeZone)),
    ...section('## Tools', toolLines(input.tools)),
    ...section('## Observations', observationLines(input)),
    ...section('## Recent calls', historyLines(input.history)),
    ...section('## Objections to answer', objectionLines(input.objections, OBJECTION_WORDING)),
    ...section('## Progress', progressLines(input.progress)),
    ...section(
      '## Limits',
      toolLimitsLines({
        causes,
        observed: input.observed,
        lastRan,
        approvalTools: input.tools.filter((tool) => tool.approval).map((tool) => tool.name),
        stepsLeft: input.stepsLeft,
      }),
    ),
    renderIndexSection(toolIndexOf(input.tools, input, causes)),
  ].join('\n');
  return withinBudget(goal, budget);
}
