/**
 * A tool session on the wire: what starts one, what a program answers for a
 * tool called directly, and the record a session leaves — one entry per
 * step with the loop run it came from, what ran, what was asked and how it
 * ended. The record is the program's to keep; this is only its shape.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';
import type { SuccessCriterion } from '../quality-loop/evidence';
import type { Objection } from '../quality-loop/read-back';
import type { Decision } from '../quality-loop/vocab';
import { excerpt } from '../text';
import type { ToolGoalRung } from './tool-goal-fit';
import type { Ask, Finish } from './tool-plan.schema';
import type { CallOutcome, ToolSessionFinalStatus, ToolSessionStatus } from './vocab';

/** The most a mission document may hold: a goal is composed around it, under the engine's budget. */
export const MISSION_BOUND = bound(12_000);
/** How much of a mission names a session: its first line of prose, excerpted. */
export const SESSION_TITLE_MAX_LENGTH = 200;

/** What starts a session: the mission, and the rails a caller may tighten for this one. */
export const startToolSessionRequestSchema = z.strictObject({
  mission: bounded.text(MISSION_BOUND, { min: 1, trim: true }),
  maxSteps: z.number().int().min(1).max(200).optional(),
  maxMinutes: z.number().int().min(1).max(1_440).optional(),
});
export type StartToolSessionRequest = z.infer<typeof startToolSessionRequestSchema>;

/** A tool called directly: `POST /tools/:name` with its arguments as the tool declares them. */
export const toolInvocationSchema = z.strictObject({
  arguments: z.record(z.string(), z.unknown()),
});
export type ToolInvocation = z.infer<typeof toolInvocationSchema>;

/** What a tool answered: how the call ended, the summary a plan reads, and the data a caller may keep. */
export interface ToolOutcome {
  outcome: Exclude<CallOutcome, 'not-executed'>;
  summary: string;
  data: unknown;
}

/** One call of one step, as the record keeps it. */
export interface CallRecord {
  tool: string;
  argumentsJson: string;
  outcome: CallOutcome;
  summary: string;
  durationMs: number;
}

/** The question a step ended on, with the operator's answer once given. */
export interface AskRecord extends Ask {
  answer: string | null;
}

export interface GoalComposition {
  rung: ToolGoalRung;
  bytes: number;
  omittedObservations: number;
}

/** One step: the loop run it asked, how the plan was read back, what ran, and what it ended on. */
export interface StepRecord {
  step: number;
  loopRunId: string | null;
  finalDecision: Decision | null;
  executable: boolean;
  executePrefix: number;
  calls: CallRecord[];
  ask: AskRecord | null;
  finish: Finish | null;
  objections: Objection[];
  composition: GoalComposition | null;
  /** What went wrong at this step when nothing was planned: the loop fault, in one line. */
  fault: string | null;
}

/** How a session ended: the mission's cause or the engine's rail, what was observed, and the status it leaves. */
export interface ToolSessionEnding {
  cause: string;
  detail: string;
  status: ToolSessionFinalStatus;
}

export interface ToolSessionRecord {
  id: string;
  /** The program that ran it, by the source it publishes under. */
  service: string;
  title: string;
  mission: string;
  status: ToolSessionStatus;
  /** The rubric derived once from the mission; null until it is. */
  criteria: SuccessCriterion[] | null;
  steps: StepRecord[];
  startedAt: string;
  endedAt: string | null;
  ending: ToolSessionEnding | null;
}

/** The session's title: the mission's first line of prose, excerpted — its headings say nothing a reader does not know. */
export function sessionTitleOf(mission: string): string {
  const line = mission
    .split('\n')
    .map((each) => each.trim())
    .find((each) => each !== '' && !each.startsWith('#'));
  return excerpt(line ?? mission.trim(), SESSION_TITLE_MAX_LENGTH);
}
