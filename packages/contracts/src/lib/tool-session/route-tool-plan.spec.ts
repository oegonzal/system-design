import { describe, expect, it } from 'vitest';

import { judgedRun as judged, type RunShape } from '../quality-loop/run-fixtures';
import { toolGoalInput } from './fixtures';
import { irrevocableParts, routeToolPlan } from './route-tool-plan';
import { composeToolGoal } from './tool-goal';
import { readToolIndex } from './tool-index';
import type { ToolPlan } from './tool-plan.schema';

const goal = composeToolGoal(toolGoalInput({ observed: true }));

/** A judged run whose goal carries the fixture index, so the read-back knows each tool's effect. */
const judgedRun = (shape: RunShape) => {
  const run = judged('tool-step', shape);
  if (run.trace !== null) run.trace.contract.goal = goal;
  return run;
};

const call = (tool: string, argumentsJson: string) => ({
  tool,
  argumentsJson,
  reason: `${tool} next`,
  expect: null,
  serves: [],
});

const plan: ToolPlan = {
  assessment: 'Alpha lacks a note; note it, then read the list again.',
  calls: [
    call('update_item', '{"id":"i1","note":"reviewed"}'),
    call('list_items', '{"query":"","limit":null}'),
  ],
  ask: null,
  finish: null,
};
const removing: ToolPlan = { ...plan, calls: [call('remove_item', '{"id":"i1"}')] };
const finishing: ToolPlan = {
  ...plan,
  calls: [],
  finish: { cause: 'nothing-left', detail: 'every item carries a note' },
};
const asking: ToolPlan = {
  ...plan,
  calls: [],
  ask: { question: 'Note Beta too?', options: ['yes', 'no'] },
};

describe('routeToolPlan', () => {
  it('[QL-72] runs an accepted plan of calls whole, a handed-back plan of reads and writes whole whatever the score, and a cut plan up to the cut', () => {
    expect(routeToolPlan(judgedRun({ artifact: plan }), 1)).toMatchObject({
      executable: true,
      executePrefix: 2,
      reason: null,
    });
    expect(
      routeToolPlan(judgedRun({ artifact: plan, finalDecision: 'escalate' }), 1),
    ).toMatchObject({
      executable: true,
      executePrefix: 2,
    });
    const cut = routeToolPlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        validation: [
          {
            validatorId: 'limits',
            gate: 'cut',
            problems: [{ severity: 'high', message: 'limit is string', locationRefs: ['call.2'] }],
          },
        ],
      }),
      3,
    );
    expect(cut).toMatchObject({ executable: true, executePrefix: 1 });
    expect(cut.objections).toEqual([
      { step: 3, from: 'limits', at: ['call.2'], detail: 'limit is string' },
    ]);
  });

  it('[QL-72] holds to the accept bar a finish, a call of an irreversible tool, and a call of a tool the index does not know', () => {
    expect(
      routeToolPlan(judgedRun({ artifact: finishing, finalDecision: 'escalate' }), 1),
    ).toMatchObject({
      executable: false,
    });
    expect(
      routeToolPlan(judgedRun({ artifact: finishing, finalDecision: 'accept' }), 1),
    ).toMatchObject({
      executable: true,
      executePrefix: 0,
    });
    expect(
      routeToolPlan(judgedRun({ artifact: removing, finalDecision: 'escalate' }), 1).executable,
    ).toBe(false);
    expect(
      routeToolPlan(judgedRun({ artifact: removing, finalDecision: 'accept' }), 1).executable,
    ).toBe(true);
    const index = readToolIndex(goal);
    expect(irrevocableParts(plan, index)).toBe(false);
    expect(irrevocableParts(removing, index)).toBe(true);
    expect(irrevocableParts({ ...plan, calls: [call('unknown_tool', '{}')] }, index)).toBe(true);
    expect(irrevocableParts(plan, null)).toBe(true);
  });

  it('[QL-72] lets an ask that nothing cut stand with no call to run, refuses a plan whose first call was faulted, and names a blocker at the assessment as whole', () => {
    expect(
      routeToolPlan(judgedRun({ artifact: asking, finalDecision: 'escalate' }), 1),
    ).toMatchObject({
      executable: true,
      executePrefix: 0,
    });
    const first = routeToolPlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: false,
        findings: [{ type: 'unsafe_call', locationRefs: ['call.1'] }],
      }),
      1,
    );
    expect(first.executable).toBe(false);
    expect(first.reason).toBe('call.1 was faulted');
    const whole = routeToolPlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: false,
        findings: [
          { type: 'missed_stop', locationRefs: ['assessment'], rationale: 'the list was empty' },
        ],
      }),
      2,
    );
    expect(whole.executable).toBe(false);
    expect(whole.reason).toContain('as a whole');
    expect(whole.objections).toEqual([
      { step: 2, from: 'missed_stop', at: ['assessment'], detail: 'the list was empty' },
    ]);
    // A closer the validator faulted sits outside the call grammar: the plan is refused whole.
    const closer = routeToolPlan(
      judgedRun({
        artifact: finishing,
        finalDecision: 'escalate',
        validation: [
          {
            validatorId: 'limits',
            gate: 'cut',
            problems: [
              { severity: 'high', message: 'finish on nothing observed', locationRefs: ['finish'] },
            ],
          },
        ],
      }),
      1,
    );
    expect(closer).toMatchObject({ executable: false, executePrefix: 0 });
  });
});
