import { finding } from '@sysdesign/contracts';
import type { StepPlan } from '@sysdesign/contracts';

import { OperatorInterrupted, QuestionWithdrawn } from './ports';
import { BrainFaulted } from './ports';
import { STOPPING } from './session-engine';
import {
  decidedAnswers,
  decidedPlan,
  FakeBrowser,
  FixedClock,
  refusing,
  ScriptedOperator,
} from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages as pages,
} from './testing-journey';
import { FakeStopSignal, runScripted as run } from './testing-session';
import { answeringFixture } from '@sysdesign/contracts';

/**
 * How a plan stops — at the first action the page refuses, or where a judge
 * cut it — and how a session ends: by each declared rail, by the operator,
 * by a fault, by an error, every path closing the browser and the row.
 */
describe('how a plan stops and how a session ends', () => {
  const refusingFills = (pageId: string): FakeBrowser =>
    refusing(new FakeBrowser(pages()), 'fill', pageId);

  it("[BRW-4] ends complete the moment its target is reached: after the step whose plan closed the last unit done, before the mission's own stop is ever planned", async () => {
    const { outcome, brain, detail } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      lines: ['Yes'],
      rails: { targetDone: 1 },
    });
    expect(outcome.status).toBe('complete');
    expect(outcome.termination).toEqual({
      reason: 'target-reached',
      detail: '1 of 1 units of work closed done',
    });
    // The fifth plan — the mission's own terminate — was never asked for.
    expect(outcome.steps).toBe(4);
    expect(brain.planInputs).toHaveLength(4);
    expect(detail).toMatchObject({
      status: 'complete',
      terminationReason: 'target-reached',
      terminationCause: null,
    });
    // Each goal told the planner where the session stood toward its target.
    expect(brain.planInputs[3]?.ledger.targetDone).toBe(1);
  });

  it('[BRW-1] stops a plan at the first action the page refuses — a field fill included — tells the next plan what did not run and why, and counts one failed step', async () => {
    // A judge cut the plan at its third action and the page refuses the first: the history says both.
    const searchThenEnter: StepPlan = {
      ...PLANS.search,
      actions: [
        ...PLANS.search.actions,
        { kind: 'press', key: 'Enter', reason: 'submit', expect: null, serves: [] },
      ],
    };
    const cut = await run({
      script: {
        plans: [
          decidedPlan(searchThenEnter, {
            findings: [finding('wrong_target', ['action.3'], 'Enter would submit twice')],
          }),
          decidedPlan(PLANS.end),
        ],
      },
      browser: refusingFills('search'),
    });
    // The history says what each action did; a note belongs to its own action.
    expect(cut.brain.planInputs[1]?.history.map((h) => [h.action, h.outcome, h.note])).toEqual([
      [
        'fill searchbox "Search" with "software engineer"',
        'failed',
        'fill e1: the element is detached',
      ],
    ]);
    // The judge's objection no longer cuts the plan — the controller accepted
    // it and found nothing blocking — so what stopped this one is the page
    // refusing an action; what came after it is held, not history.
    expect(cut.brain.planInputs[1]?.lastStep).toEqual({
      ran: 0,
      touched: [],
      held: ['click', 'press'],
    });
    // The controller accepted the plan and found nothing blocking, so what the
    // judge said is advice on the run's record — not an objection the next
    // plan has to answer. Measured 2026-10-07: advice carried as objections
    // taught a producer a stop condition the page never showed.
    expect(cut.brain.planInputs[1]?.objections).toEqual([]);
    expect(cut.browser.calls).not.toContain('click e2');
    expect(cut.outcome.termination).toMatchObject({
      reason: 'mission-stop',
      cause: 'mission-complete',
    });

    // A field the page refuses stops the fields after it and the plan's click, and moves the count once.
    const form = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.end].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      browser: refusingFills('form'),
      rails: { maxConsecutiveFailures: 2 },
    });
    expect(form.outcome.termination).toMatchObject({
      reason: 'mission-stop',
      cause: 'mission-complete',
    });
    expect(form.browser.pageId).toBe('form');
    expect(form.browser.calls).not.toContain('click e6');
    expect(form.operator.questions).toEqual([]);
    expect(form.brain.planInputs[3]?.history.slice(-1).map((h) => [h.outcome, h.note])).toEqual([
      ['failed', '3 field(s): 0 filled, 0 kept, 0 asked, 0 blank, 1 failed, 2 not attempted'],
    ]);
    expect(form.brain.planInputs[3]?.lastStep?.held).toEqual(['click']);
    const rows = form.detail.decisions.filter((d) => d.kind === 'field-answer');
    expect(rows.map((d) => [d.ref, d.payload['outcome']])).toEqual([['e1', 'failed']]);
    const dumped = JSON.parse(form.dumps.text('01-steps/03/fields.json')) as {
      fields: { result: unknown }[];
    };
    expect(dumped.fields.map((field) => field.result === null)).toEqual([false, true, true]);
  });

  it('[BRW-4] stops on each declared rail with the status the termination table gives, closing the browser every time', async () => {
    const byTasks = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      rails: { maxTasks: 1 },
    });
    expect(byTasks.outcome.termination.reason).toBe('max-tasks');
    expect(byTasks.outcome.status).toBe('stopped');
    expect(byTasks.detail.decisions.find((d) => d.kind === 'termination')?.source).toBe('engine');
    expect(byTasks.brain.planInputs).toHaveLength(4);
    expect(byTasks.browser.closed).toBe(true);

    // A unit found already done, or set aside unworked, spends none of the
    // budget: under the same `maxTasks: 1` the session goes on to a listing it
    // can work, and stops only when that one closes done. Measured 2026-10-07:
    // the one unit of a session was a listing applied to before, and the goal
    // told the planner it could start no other from the moment it opened.
    const closeAs = (outcome: 'already-done' | 'skipped'): StepPlan => ({
      ...PLANS.results,
      actions: [
        ...PLANS.results.actions.slice(0, 1),
        {
          kind: 'taskDone',
          outcome,
          detail: 'not this listing',
          reason: 'the pane shows no form to work',
          expect: null,
          serves: [],
        },
      ],
    });
    const unspent = await run({
      script: {
        plans: [
          PLANS.search,
          closeAs('already-done'),
          closeAs('skipped'),
          PLANS.results,
          PLANS.form,
          PLANS.done,
        ].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      rails: { maxTasks: 1 },
    });
    expect(unspent.outcome.termination).toEqual({
      reason: 'max-tasks',
      detail: '1 of 1 units of work closed done or failed, 3 started',
    });
    expect(unspent.brain.planInputs).toHaveLength(6);
    expect(unspent.brain.planInputs[3]?.ledger).toMatchObject({
      openTask: null,
      counts: { done: 0, 'already-done': 1, skipped: 1, failed: 0 },
      remainingTasks: 1,
    });

    // The page took a minute and a half to come up: the clock jumps once, and the rail reads it.
    const clock = new FixedClock(new Date('2026-10-03T10:00:00.000Z'), 0);
    const slow = new FakeBrowser(pages());
    const observe = slow.observe.bind(slow);
    slow.observe = async () => {
      clock.advance(90_000);
      return observe();
    };
    const byMinutes = await run({
      script: { plans: [decidedPlan(PLANS.search)] },
      rails: { maxMinutes: 1 },
      clock,
      browser: slow,
    });
    expect(byMinutes.outcome.termination).toEqual({
      reason: 'max-minutes',
      detail: '1.5 of 1 minutes elapsed',
    });

    const escalated = decidedPlan(PLANS.search, {
      decision: 'escalate',
      policyAllowed: false,
      findings: [finding('missed_stop', [], 'the page shows the limit text')],
    });
    const byFailures = await run({
      script: { plans: [escalated, escalated, escalated] },
      rails: { maxConsecutiveFailures: 3 },
    });
    expect(byFailures.outcome.termination.reason).toBe('max-failures');
    // A refused plan is one line of history, not one per action it proposed:
    // measured 2026-10-07, six-action refusals filled HISTORY_MAX in two steps
    // and the producer read its own refused proposals as the recent past.
    expect(byFailures.brain.planInputs[1]?.history).toEqual([
      { action: 'plan of 2 action(s): fill, click', outcome: 'not-executed', note: null },
    ]);
    // The objection travels on its own, once for the plan it was about.
    expect(byFailures.brain.planInputs[1]?.objections).toEqual([
      { step: 1, from: 'missed_stop', at: [], detail: 'the page shows the limit text' },
    ]);
    // After a second refusal: two lines, and two objections, newest first.
    expect(byFailures.brain.planInputs[2]?.history).toHaveLength(2);
    expect(byFailures.brain.planInputs[2]?.objections.map((o) => o.step)).toEqual([2, 1]);
    expect(byFailures.browser.calls).not.toContain('fill e1');

    const fault = new BrainFaulted('unreachable', 'nobody home');
    const byFaults = await run({ script: { plans: [fault, fault, fault] } });
    expect(byFaults.outcome.termination.reason).toBe('brain-unavailable');
    expect(
      byFaults.detail.decisions.filter((d) => d.kind === 'step-plan').map((d) => d.source),
    ).toEqual(['engine', 'engine', 'engine']);
    expect(byFaults.dumps.files.has('01-steps/01/fault.json')).toBe(true);

    const byOperator = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      lines: ['/stop'],
    });
    expect(byOperator.outcome.termination.reason).toBe('operator-stop');
    expect(byOperator.outcome.status).toBe('stopped');

    const noRubric = await run({
      script: { plans: [], deriveFault: new BrainFaulted('failed', 'no model') },
    });
    expect(noRubric.outcome.termination.reason).toBe('brain-unavailable');
    expect(noRubric.browser.opened).toBeNull();
    expect(noRubric.detail.status).toBe('stopped');
  });

  it('[BRW-4] a stop while a question waits on the operator withdraws it as abandoned, asks nothing more, and ends the session operator-stop', async () => {
    const stop = new FakeStopSignal();
    const operator = new ScriptedOperator(['Yes', 'Yes', 'Yes']);
    const withdrawals: unknown[] = [];
    const ask = operator.ask.bind(operator);
    // The stop lands while the first question is open.
    operator.ask = (question, signal) => {
      signal?.addEventListener('abort', () => withdrawals.push(signal.reason), { once: true });
      stop.press();
      return ask(question, signal);
    };
    const { outcome, detail } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator,
      stop,
      // Every kind asks, so the form has more than one question for the operator — only the first is put.
      answering: answeringFixture(['stated', 'inferred']),
    });
    expect(outcome.termination.reason).toBe('operator-stop');
    expect(outcome.status).toBe('stopped');
    expect(withdrawals).toEqual([STOPPING]);
    expect(operator.questions).toHaveLength(1);
    // The withdrawn field's row reads as the operator's stop, the one path for the signal and the reply.
    const stopped = detail.decisions.filter(
      (decision) => decision.kind === 'field-answer' && decision.payload['reply'] === 'stop',
    );
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({ source: 'operator', answer: null });

    // Ctrl-C at an open terminal question is that same stop, never a failed session.
    const interrupted = new ScriptedOperator();
    interrupted.ask = () => Promise.reject(new OperatorInterrupted());
    const byInterrupt = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator: interrupted,
    });
    expect(byInterrupt.outcome.termination.reason).toBe('operator-stop');
    expect(byInterrupt.outcome.status).toBe('stopped');

    // A withdrawal that is not the stop is still a withdrawal: nothing here swallows it.
    const withdrawn = new ScriptedOperator();
    withdrawn.ask = () => Promise.reject(new QuestionWithdrawn('spec'));
    const byWithdrawal = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator: withdrawn,
    });
    expect(byWithdrawal.outcome.termination.reason).toBe('error');
  });

  it('[BRW-4] counts brain faults in a row: an answered plan clears the count, so faults apart never stop a session and three in a row still do', async () => {
    // Measured 2026-10-10: three faults in three seconds of one loop restart ended a session forty minutes in.
    const fault = new BrainFaulted('unreachable', 'the loop is restarting');
    const apart = await run({
      script: {
        plans: [
          fault,
          fault,
          decidedPlan(PLANS.search),
          fault,
          fault,
          decidedPlan(PLANS.results),
          fault,
          fault,
          fault,
        ],
        answers: [decidedAnswers(ANSWERS)],
      },
    });
    expect(apart.outcome.termination).toEqual({
      reason: 'brain-unavailable',
      detail: '3 brain faults in a row, limit 3',
    });
    expect(
      apart.detail.decisions.filter((d) => d.kind === 'step-plan' && d.source === 'engine'),
    ).toHaveLength(7);
  });

  it('[BRW-4] counts a step that ran and moved nothing toward the stall, and skips a redundant taskStart rather than refusing the actions beside it', async () => {
    // Measured 2026-10-07: twelve observations of one unchanged landing page,
    // each step a navigate that ran clean, and a count of failed steps saw
    // none of them; and five plans on an application form voided whole for a
    // taskStart while the unit was already open.
    const press: StepPlan = {
      ...PLANS.search,
      actions: [{ kind: 'press', key: 'Tab', reason: 'move the focus', expect: null, serves: [] }],
    };
    const stalled = await run({
      script: { plans: [decidedPlan(press), decidedPlan(press), decidedPlan(press)] },
      rails: { maxStalledSteps: 3, maxConsecutiveFailures: 1 },
    });
    expect(stalled.outcome.termination).toEqual({
      reason: 'page-stalled',
      detail: '3 observations in a row of a page that did not change, limit 3',
    });
    // Every press ran and none failed: the stall is the only rail that saw it.
    expect(stalled.browser.calls.filter((call) => call === 'press Tab')).toHaveLength(3);
    expect(stalled.brain.planInputs).toHaveLength(3);

    const reopened: StepPlan = {
      ...PLANS.results,
      actions: [
        PLANS.results.actions[0] as StepPlan['actions'][number],
        { kind: 'done', reason: 'nothing else is due', expect: null, serves: [] },
      ],
    };
    const skipped = await run({
      script: {
        plans: [PLANS.search, PLANS.results, reopened, PLANS.end].map((p) => decidedPlan(p)),
      },
    });
    // The second taskStart is recorded and skipped; the plan beside it still ran.
    expect(skipped.brain.planInputs[3]?.history.slice(-2)).toEqual([
      {
        action: 'taskStart "Senior Engineer at Acme"',
        outcome: 'not-executed',
        note: 'a unit of work is already open',
      },
      { action: 'done', outcome: 'ok', note: null },
    ]);
    expect(skipped.detail.tasks).toHaveLength(1);
    expect(skipped.outcome.termination).toMatchObject({
      reason: 'mission-stop',
      cause: 'mission-complete',
    });
  });

  it('[BRW-4] a browser that throws ends the session failed with the error recorded, the row closed and the dump indexed', async () => {
    const browser = new FakeBrowser(pages());
    browser.observe = async () => {
      throw new Error('the tab crashed');
    };
    const { outcome, detail, dumps, ledger } = await run({ script: { plans: [] }, browser });
    expect(outcome.status).toBe('failed');
    expect(outcome.termination.reason).toBe('error');
    expect(detail.error).toEqual({ name: 'Error', message: 'the tab crashed' });
    expect(detail.finishedAt).not.toBeNull();
    expect(browser.closed).toBe(true);
    expect(dumps.index).toHaveLength(1);
    expect(JSON.parse(dumps.index[0] ?? '{}')).toMatchObject({ kind: 'session', status: 'failed' });
    expect(dumps.files.has('manifest.json')).toBe(true);
    expect(ledger.sessions.size).toBe(1);
  });
});
