/**
 * Builders the tool-step specs share. Pure helpers only — no vitest imports —
 * so the file compiles under the app tsconfig. The goals are composed with the
 * contracts codec over the contracts fixtures, exactly as a session composes
 * them; the plans are the smallest that exercise a rule.
 */
import {
  composeToolGoal,
  sampleObservation,
  toolGoalInput,
  type Ask,
  type Finish,
  type SuccessCriterion,
  type ToolCall,
  type ToolGoalInput,
  type ToolPlan,
} from '@sysdesign/contracts';

/** The mission over the fixture tools with nothing observed yet, unless a spec says. */
export const toolGoal = (overrides: Partial<ToolGoalInput> = {}): string =>
  composeToolGoal(toolGoalInput(overrides));

/** The goal once the list has been read: one observation, so a finish has something to rest on. */
export const observedGoal = (overrides: Partial<ToolGoalInput> = {}): string =>
  toolGoal({ observed: true, observations: [sampleObservation()], ...overrides });

export const call = (
  tool: string,
  argumentsJson: string,
  reason = `${tool} is the next step`,
  expect: string | null = null,
): ToolCall => ({ tool, argumentsJson, reason, expect, serves: [] });

export const listItems = (): ToolCall =>
  call('list_items', '{"query":"","limit":null}', 'the procedure begins with the list');

export const updateItem = (id = 'i1'): ToolCall =>
  call('update_item', `{"id":"${id}","note":"reviewed"}`, `${id} lacks a note`);

export const removeItem = (id = 'i1'): ToolCall =>
  call('remove_item', `{"id":"${id}"}`, `${id} is marked for removal`);

export const ask = (
  question = 'Which item is the house account?',
  options: string[] = ['Alpha', 'Beta'],
): Ask => ({ question, options });

export const finish = (
  cause = 'nothing-left',
  detail = 'every listed item carries a note',
): Finish => ({ cause, detail });

/** The plan the first step calls for: read the list. */
export const samplePlan = (
  calls: ToolCall[] = [listItems()],
  overrides: Partial<ToolPlan> = {},
): ToolPlan => ({
  assessment: 'Nothing observed yet; the procedure begins by listing the items.',
  calls,
  ask: null,
  finish: null,
  ...overrides,
});

/** The rubric a session derives once from the mission and supplies on every run. */
export const sessionCriteria = (): SuccessCriterion[] => [
  { id: 'c1', kind: 'progress', statement: 'List the items before any item is updated.' },
  {
    id: 'c2',
    kind: 'safety',
    statement: 'Finish with service-down when the list cannot be read twice in a row.',
  },
  {
    id: 'c3',
    kind: 'grounding',
    statement: 'The assessment names what the observations show.',
  },
];
