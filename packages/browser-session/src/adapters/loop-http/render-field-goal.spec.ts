import {
  FIELD_ANSWER_PIPELINE_ID,
  GOAL_BUDGET_BYTES,
  GoalBudgetExceeded,
  heaviestRecordedFields,
  MISSION_WITH_CONTEXT,
  textBytes,
} from '@sysdesign/contracts';

import { unitContextOf, type FormTask } from '../../core/open-unit';
import type { FieldsInput } from '../../core/ports';
import { toBrainFault } from './loop-brain';
import { composeFieldGoalWithinBudget, OPEN_UNIT_HEADING, renderFieldProse } from './render-goal';

/**
 * The form goal's prose and its ladder: what the goal states of the open unit
 * and of the page's statement about it, and how a statement too large for the
 * budget is fitted — cut at a node boundary before any field, dropped before
 * the goal is refused — with every cut said in the title over it.
 */
const SESSION = { sessionId: 'session-1', step: 6 };
const CRITERIA = [{ id: 'c1', kind: 'grounding', statement: 'Rest every value on the evidence.' }];

describe('the form goal', () => {
  it('[BRW-16] states under the open unit what the page laid out under the declared landmark — titled by that landmark, counting the nodes shown — and fits the statement to the budget by a declared ladder: cut at a node boundary before any field, dropped before the goal is refused', () => {
    const task: FormTask = {
      label: 'Senior Engineer at Acme',
      url: 'https://jobs.example.test/apply/42',
      facets: [{ name: 'company', value: 'Acme' }],
      unitKey: 'company=acme',
      context: { landmark: 'main', text: 'Acme builds tools for teams.\nRemote', omitted: 0 },
    };
    const TITLE =
      'What the page laid out under its main landmark as the unit opened — its words, node by node, which may name other items beside this unit';
    expect(renderFieldProse({ mission: MISSION_WITH_CONTEXT, task })).toContain(
      [
        OPEN_UNIT_HEADING,
        '',
        '"Senior Engineer at Acme" at https://jobs.example.test/apply/42 · company "Acme"',
        '',
        `${TITLE}:`,
        '',
        'Acme builds tools for teams.',
        'Remote',
      ].join('\n'),
    );
    // A statement the capture bound cut says so over its lines: the beginning is never called the whole.
    expect(
      renderFieldProse({
        mission: MISSION_WITH_CONTEXT,
        task: {
          ...task,
          context: { landmark: 'main', text: task.context?.text ?? '', omitted: 3 },
        },
      }),
    ).toContain(`${TITLE} — the first 2 of 5 nodes, 3 not shown:`);
    // No statement captured, and the unit reads as before one could be.
    const bare = `${OPEN_UNIT_HEADING}\n\n"Senior Engineer at Acme" at https://jobs.example.test/apply/42 · company "Acme"`;
    expect(
      renderFieldProse({ mission: MISSION_WITH_CONTEXT, task: { ...task, context: null } }),
    ).toMatch(new RegExp(`${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(renderFieldProse({ mission: MISSION_WITH_CONTEXT, task: null })).toContain(
      'No unit of work is open.',
    );

    // The ladder, over a statement at its bound — 300 nodes of 100 bytes, of which the capture keeps 297 —
    // and the heaviest field list any recorded form goal carried.
    const lines = Array.from({ length: 300 }, (_, at) => `${at} `.padEnd(100, 'x'));
    const atBound = unitContextOf(lines, 'main');
    expect(atBound).toMatchObject({ omitted: 3 });
    const input: FieldsInput = {
      session: SESSION,
      mission: MISSION_WITH_CONTEXT,
      task: { ...task, context: atBound },
      fields: heaviestRecordedFields(),
      criteria: CRITERIA,
    };
    const whole = composeFieldGoalWithinBudget(FIELD_ANSWER_PIPELINE_ID, input);
    expect(whole).toMatchObject({ rung: 'full', snapshotRung: null, bytes: textBytes(whole.goal) });
    expect(whole.bytes).toBeLessThanOrEqual(GOAL_BUDGET_BYTES);
    expect(whole.goal).toContain(`${TITLE} — the first 297 of 300 nodes, 3 not shown:`);
    // With less room the statement is cut to it — whole lines, in document order, the title counting them —
    // and the fields are untouched; the slack is under one line and the title's few digits.
    const room = whole.bytes - 1000;
    const cut = composeFieldGoalWithinBudget(FIELD_ANSWER_PIPELINE_ID, input, room);
    expect(cut.rung).toBe('statement-cut');
    expect(cut.bytes).toBeLessThanOrEqual(room);
    expect(room - cut.bytes).toBeLessThan(120);
    const counted = /the first (\d+) of 300 nodes, (\d+) not shown:/.exec(cut.goal);
    const shown = Number(counted?.[1]);
    expect(shown + Number(counted?.[2])).toBe(300);
    expect(shown).toBeLessThan(297);
    expect(cut.goal).toContain(`\n${lines[shown - 1]}\n`);
    expect(cut.goal).not.toContain(lines[shown] ?? 'never');
    for (const field of input.fields) expect(cut.goal).toContain(`- ${field.ref} · textbox`);
    // With no room for one line the statement is dropped and the goal says so; with no room for the goal
    // itself the composer refuses, which the brain reports as the goal-budget fault.
    const without = composeFieldGoalWithinBudget(FIELD_ANSWER_PIPELINE_ID, {
      ...input,
      task: { ...task, context: null },
    });
    const noneTitle = `${TITLE} — none of its 300 nodes fit this goal.`;
    const dropped = composeFieldGoalWithinBudget(
      FIELD_ANSWER_PIPELINE_ID,
      input,
      without.bytes + 2 + textBytes(noneTitle) + 50,
    );
    expect(dropped.rung).toBe('without-statement');
    expect(dropped.goal).toContain(noneTitle);
    expect(dropped.goal).not.toContain(lines[0] ?? 'never');
    expect(() =>
      composeFieldGoalWithinBudget(FIELD_ANSWER_PIPELINE_ID, input, without.bytes + 1),
    ).toThrow(GoalBudgetExceeded);
    expect(toBrainFault(new GoalBudgetExceeded(65_000, 64_000))).toMatchObject({
      reason: 'goal-budget',
    });
  });
});
