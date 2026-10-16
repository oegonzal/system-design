/**
 * The input codec of the tool-step pipeline. The goal is composed by a tool
 * session with the contracts codec (`composeToolGoal`): the mission verbatim,
 * the tools it may call, what earlier calls returned, what was just done,
 * what the plans before were refused for, and the index of facts the
 * validators check a plan against. The index is read back here through the
 * engine's own fence reader, so no rule ever parses prose.
 */
import {
  TOOL_STEP_PIPELINE_ID,
  toolIndexSchema,
  type ToolIndex,
  readFencedIndex,
} from '@sysdesign/contracts';

export { TOOL_STEP_PIPELINE_ID };
export type { ToolIndex };

/** The index the session wrote, or null for a goal that is not a tool step. */
export const readIndex = (goal: string): ToolIndex | null => readFencedIndex(goal, toolIndexSchema);
