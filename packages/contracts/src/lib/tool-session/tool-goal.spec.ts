import { describe, expect, it } from 'vitest';

import { GOAL_BUDGET_BYTES, GoalBudgetExceeded, textBytes } from '../quality-loop/goal-index';
import { sampleObservation, toolGoalInput } from './fixtures';
import { composeToolGoal } from './tool-goal';
import { composeToolGoalWithinBudget } from './tool-goal-fit';
import { readToolIndex } from './tool-index';
import { CALLS_BOUND } from './tool-plan.schema';
import { OBSERVATION_EXCERPT_MAX_LENGTH } from './vocab';

/** The goal's text between two of its headings, which must both be there. */
const between = (goal: string, heading: string, next: string): string => {
  const start = goal.indexOf(heading);
  const end = start < 0 ? -1 : goal.indexOf(next, start);
  if (end < 0) throw new Error(`the goal has no ${heading} followed by ${next}`);
  return goal.slice(start + heading.length, end);
};

describe('composeToolGoal', () => {
  it('[QL-72] writes the sections in order, the mission first and the index last, and the index reads back every fact the validators check', () => {
    const goal = composeToolGoal(toolGoalInput());
    const headings = [
      '# Mission',
      '## Tools',
      '## Observations',
      '## Recent calls',
      '## Objections to answer',
      '## Progress',
      '## Limits',
      '## Index',
    ];
    const positions = headings.map((heading) => goal.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const index = readToolIndex(goal);
    expect(index).toMatchObject({
      pipeline: 'tool-step',
      maxCalls: CALLS_BOUND.target,
      observed: false,
      lastRan: [],
      causes: ['nothing-left', 'service-down'],
    });
    expect(index?.tools.map((tool) => [tool.name, tool.effect, tool.approval])).toEqual([
      ['list_items', 'read', false],
      ['update_item', 'write', false],
      ['remove_item', 'irreversible', true],
    ]);
    expect(index?.tools[0]?.parameters['required']).toEqual(['query', 'limit']);
    // The model's view: the tools one line each, no observation, no call, no objection.
    expect(between(goal, '## Tools', '## Observations')).toContain(
      '- remove_item (irreversible, asks you first): Removes one item for good.',
    );
    expect(between(goal, '## Observations', '## Recent calls')).toContain(
      '(none yet — no call has run)',
    );
    expect(between(goal, '## Objections to answer', '## Progress')).toContain(
      '(none — no plan made at this step has been refused)',
    );
  });

  it('[QL-72] states the limits that apply: the ceiling, the one-of rule, the declared causes, no finish before an observation, the approval-gated tools, the cut repeats, and the steps left', () => {
    const first = between(composeToolGoal(toolGoalInput()), '## Limits', '## Index');
    expect(first).toContain(`At most ${CALLS_BOUND.target} calls`);
    expect(first).toContain("waits for the operator's approval (remove_item)");
    expect(first).toContain('nothing-left, service-down');
    expect(first).toContain('No finish is possible on this step');
    expect(first).toContain('30 steps remain');
    expect(first).not.toContain('Repeating a call');

    const later = composeToolGoal(
      toolGoalInput({
        observed: true,
        observations: [sampleObservation()],
        lastStep: {
          ran: 2,
          calls: [
            { tool: 'list_items', argumentsJson: '{"limit":null,"query":""}', outcome: 'ok' },
            { tool: 'update_item', argumentsJson: '{"note":"x","id":"i1"}', outcome: 'failed' },
          ],
        },
        stepsLeft: 1,
      }),
    );
    const limits = between(later, '## Limits', '## Index');
    expect(limits).not.toContain('No finish is possible');
    expect(limits).toContain('Repeating a call that failed or was refused');
    expect(limits).toContain('update_item');
    expect(limits).not.toContain('list_items "');
    expect(limits).toContain('1 step remain');
    // The index carries what ran in canonical form, so a reordered repeat is still the same call.
    expect(readToolIndex(later)?.lastRan).toEqual([
      { tool: 'list_items', argumentsJson: '{"limit":null,"query":""}', outcome: 'ok' },
      { tool: 'update_item', argumentsJson: '{"id":"i1","note":"x"}', outcome: 'failed' },
    ]);
    expect(between(later, '## Observations', '## Recent calls')).toContain(
      '### Observation 1 — list_items {"query":"","limit":null} · step 1 · ok',
    );
  });

  it('[QL-72] groups the tools by the program that runs them when there is more than one, and renders the recent calls with a call that did not run leading with that fact', () => {
    const tools = toolGoalInput().tools;
    const peer = { ...tools[0], name: 'count_items', provider: 'other' };
    if (peer.name === undefined) throw new Error('fixture tool missing');
    const goal = composeToolGoal(
      toolGoalInput({
        tools: [...tools, peer],
        history: [
          { call: 'list_items "{}"', outcome: 'ok', note: null },
          {
            call: 'remove_item "{\\"id\\":\\"i1\\"}"',
            outcome: 'not-executed',
            note: 'cut at call.2',
          },
        ],
      }),
    );
    const section = between(goal, '## Tools', '## Observations');
    expect(section).toContain('From example:');
    expect(section).toContain('From other:');
    expect(section.indexOf('From example:')).toBeLessThan(section.indexOf('From other:'));
    const recent = between(goal, '## Recent calls', '## Objections to answer');
    expect(recent).toContain('- list_items "{}" — ok');
    expect(recent).toContain('- not-executed (proposed, did not run): remove_item');
  });

  it('[QL-72] fits the budget by declared rungs — every result whole, then every result but the newest excerpted, then the oldest left out and counted — and refuses when the newest alone would not fit', () => {
    const long = 'r'.repeat(OBSERVATION_EXCERPT_MAX_LENGTH * 4);
    const observations = Array.from({ length: 8 }, (_, i) =>
      sampleObservation({ step: i + 1, result: `${i + 1}:${long}` }),
    );
    const input = toolGoalInput({ observed: true, observations });
    const full = composeToolGoalWithinBudget(input);
    expect(full.rung).toBe('full');
    expect(full.bytes).toBe(textBytes(full.goal));
    expect(full.bytes).toBeLessThanOrEqual(GOAL_BUDGET_BYTES);

    const excerpted = composeToolGoalWithinBudget(input, full.bytes - 1);
    expect(excerpted.rung).toBe('observations-excerpted');
    expect(excerpted.omittedObservations).toBe(0);
    // The newest result is kept whole; an older one is cut to the excerpt length.
    expect(excerpted.goal).toContain(`8:${long}`);
    expect(excerpted.goal).not.toContain(`1:${long}`);

    const fewer = composeToolGoalWithinBudget(input, excerpted.bytes - 1);
    expect(fewer.rung).toBe('fewer-observations');
    expect(fewer.omittedObservations).toBeGreaterThan(0);
    expect(fewer.goal).toContain(`(${fewer.omittedObservations} earlier observations not shown)`);
    expect(fewer.goal).toContain('### Observation 8 — ');

    const bare = textBytes(composeToolGoal(toolGoalInput({ observed: true })));
    expect(() => composeToolGoalWithinBudget(input, bare - 1)).toThrow(GoalBudgetExceeded);
  });
});
