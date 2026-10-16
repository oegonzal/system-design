import { CALLS_BOUND, sampleObservation } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import {
  ask,
  call,
  finish,
  listItems,
  removeItem,
  samplePlan,
  toolGoal,
  updateItem,
} from './testing';
import { first, observed, problems } from './validators.testing';

describe('the tool-step validators', () => {
  it('[QL-72] cuts a call naming a tool the index does not list, at that call, and refuses a goal with no index once', () => {
    const plan = samplePlan([listItems(), call('count_items', '{}')]);
    expect(problems(plan).references).toEqual([
      {
        severity: 'critical',
        message: 'count_items is not a listed tool',
        locationRefs: ['call.2'],
      },
    ]);
    expect(problems(plan).limits).toEqual([]);
    const noIndex = problems(samplePlan(), '# Mission\n\nNo index here.');
    expect(noIndex.references).toHaveLength(1);
    expect(noIndex.references[0]?.message).toContain('no tool-step index');
    expect(noIndex.limits).toEqual([]);
  });

  it('[QL-72] cuts at the first call past the ceiling, so the calls within it still run', () => {
    const many = samplePlan(Array.from({ length: CALLS_BOUND.ceiling }, () => listItems()));
    const { limits } = problems(many);
    expect(limits).toHaveLength(1);
    expect(limits[0]).toMatchObject({
      message: `${CALLS_BOUND.ceiling} calls planned; the limit is ${CALLS_BOUND.target}`,
      locationRefs: [`call.${CALLS_BOUND.target + 1}`],
    });
  });

  it('[QL-72] cuts every call after an irreversible one, and after one a person approves, since its outcome has not been observed', () => {
    const { limits } = problems(samplePlan([removeItem(), listItems()]));
    expect(limits).toHaveLength(1);
    expect(limits[0]).toMatchObject({
      message:
        'list_items follows the approval-gated remove_item at call.1: the outcome it would be planned on has not been observed',
      locationRefs: ['call.2'],
    });
    // A read or a write ends nothing: the plan goes on.
    expect(problems(samplePlan([listItems(), updateItem(), listItems()])).limits).toEqual([]);
  });

  it('[QL-72] cuts a call whose arguments are not one JSON object of the declared parameters, naming each fault', () => {
    const notObject = problems(samplePlan([call('list_items', '["a"]')])).limits;
    expect(notObject.map((problem) => problem.message)).toEqual([
      'arguments are not one JSON object',
    ]);
    const faults = problems(samplePlan([call('list_items', '{"query":1,"page":2}')])).limits.map(
      (problem) => problem.message,
    );
    expect(faults).toEqual([
      'page is not a parameter the tool declares',
      'limit is required and missing',
      'query is integer; the tool declares string',
    ]);
    expect(problems(samplePlan([call('list_items', '{"query":"a","limit":3}')])).limits).toEqual(
      [],
    );
  });

  it('[QL-72] cuts a repeat, with the same arguments, of a call that failed or was refused at the last step — and not of one that ran', () => {
    const goal = toolGoal({
      observed: true,
      observations: [sampleObservation()],
      lastStep: {
        ran: 2,
        calls: [
          { tool: 'list_items', argumentsJson: '{"query":"","limit":null}', outcome: 'ok' },
          {
            tool: 'update_item',
            argumentsJson: '{"note":"reviewed","id":"i1"}',
            outcome: 'failed',
          },
        ],
      },
    });
    const repeat = problems(samplePlan([listItems(), updateItem('i1')]), goal).limits;
    expect(repeat).toHaveLength(1);
    expect(repeat[0]).toMatchObject({ locationRefs: ['call.2'] });
    expect(repeat[0]?.message).toContain(
      'update_item ran at the last step with these arguments and failed',
    );
    expect(problems(samplePlan([updateItem('i2')]), goal).limits).toEqual([]);
  });

  it('[QL-72] refuses a question and a finish together, either beside a call, a finish on an undeclared cause, a finish before anything was observed, and a plan that does nothing — each at the closer, outside the call grammar', () => {
    expect(problems(samplePlan([], { ask: ask(), finish: finish() })).limits).toEqual([
      {
        severity: 'high',
        message: 'a plan ends on a question or a finish, not both',
        locationRefs: ['finish'],
      },
    ]);
    const asksBeside = problems(samplePlan([listItems()], { ask: ask() })).limits;
    expect(asksBeside).toHaveLength(1);
    expect(asksBeside[0]).toMatchObject({ locationRefs: ['ask'] });
    expect(asksBeside[0]?.message).toContain('a question ends a plan alone');
    const undeclared = problems(samplePlan([], { finish: finish('all-done') })).limits;
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0]?.message).toBe(
      'finish all-done: the mission declares no such stop condition — it declares nothing-left, service-down',
    );
    const early = problems(samplePlan([], { finish: finish() }), first).limits;
    expect(early).toHaveLength(1);
    expect(early[0]?.message).toContain('finish on nothing observed');
    expect(problems(samplePlan([], { finish: finish() }), observed).limits).toEqual([]);
    expect(problems(samplePlan([])).limits).toEqual([
      {
        severity: 'high',
        message: 'the plan does nothing: plan a call, ask, or finish',
        locationRefs: ['assessment'],
      },
    ]);
  });
});
