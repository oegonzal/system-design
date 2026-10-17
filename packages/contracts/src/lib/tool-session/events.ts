/**
 * What a tool session says happened, on the bus, for whoever keeps a record
 * beyond it: that it started, what each step did, and how it ended. Every
 * program that runs sessions publishes these under its own source, so a
 * subscriber reads one shape whichever program spoke.
 */
import { z } from 'zod';

import { SOURCE_MAX_LENGTH } from '../notifications/bus';
import { SESSION_TITLE_MAX_LENGTH } from './session';
import { CALL_OUTCOMES, TOOL_NAME_MAX_LENGTH, TOOL_SESSION_FINAL_STATUSES } from './vocab';

export const TOOL_SESSION_TOPICS = {
  started: 'tool-session.started',
  stepped: 'tool-session.stepped',
  finished: 'tool-session.finished',
} as const;

const base = {
  /** The program that ran the session, by the source it publishes under. */
  service: z.string().min(1).max(SOURCE_MAX_LENGTH),
  sessionId: z.uuid(),
};

export const toolSessionStartedSchema = z.strictObject({
  ...base,
  title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
  startedAt: z.iso.datetime(),
});
export type ToolSessionStarted = z.infer<typeof toolSessionStartedSchema>;

export const toolSessionSteppedSchema = z.strictObject({
  ...base,
  step: z.number().int().min(1),
  loopRunId: z.string().nullable(),
  executable: z.boolean(),
  calls: z.array(
    z.strictObject({
      tool: z.string().min(1).max(TOOL_NAME_MAX_LENGTH),
      outcome: z.enum(CALL_OUTCOMES),
    }),
  ),
  /** Whether the step ended on a question to the operator. */
  asked: z.boolean(),
  /** Whether the step ended the session on a mission stop. */
  finished: z.boolean(),
});
export type ToolSessionStepped = z.infer<typeof toolSessionSteppedSchema>;

export const toolSessionFinishedSchema = z.strictObject({
  ...base,
  status: z.enum(TOOL_SESSION_FINAL_STATUSES),
  cause: z.string().min(1),
  detail: z.string(),
  steps: z.number().int().min(0),
  endedAt: z.iso.datetime(),
});
export type ToolSessionFinished = z.infer<typeof toolSessionFinishedSchema>;
