/**
 * The input codec of the browser-step pipeline. The goal is composed by the
 * browser session with the contracts codec (`composeStepGoal`): the mission
 * verbatim, the page and its elements, what was just done, where the units of
 * work stand, and the index of facts the validators check a plan against.
 * The index is read back here through the engine's own fence reader — a spec
 * pins the fence the composer writes equal to the one the engine reads — so
 * no rule ever parses prose.
 */
import { BROWSER_STEP_PIPELINE_ID, stepIndexSchema, type StepIndex } from '@sysdesign/contracts';

import { readFencedIndex } from '../../core/contracts';

export { BROWSER_STEP_PIPELINE_ID };
export type { StepIndex };

/** The index the session wrote, or null for a goal that is not a browser step. */
export const readIndex = (goal: string): StepIndex | null => readFencedIndex(goal, stepIndexSchema);
