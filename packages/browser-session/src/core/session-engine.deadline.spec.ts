import { answeringFixture, SESSION_TOPICS } from '@sysdesign/contracts';

import { OUT_OF_TIME } from './session-engine';
import { decidedAnswers, decidedPlan, ScriptedOperator } from './testing';
import { FixedClock } from './testing-clock';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  nextUnitPlan,
} from './testing-journey';
import { runScripted as run, SPEC_RAILS } from './testing-session';

/** An operator who lets the given minutes pass before the first answer, the clock moving with them, and the withdrawals of questions still waiting. */
const slowOperator = (clock: FixedClock, minutes: number, lines: string[]) => {
  const operator = new ScriptedOperator(lines);
  const withdrawals: unknown[] = [];
  const ask = operator.ask.bind(operator);
  let waited = false;
  operator.ask = async (question, signal) => {
    // Only a stop that lands while the question waits withdraws it; one after its answer withdraws nothing.
    const withdrawn = (): void => {
      withdrawals.push(signal?.reason);
    };
    signal?.addEventListener('abort', withdrawn, { once: true });
    try {
      if (!waited) {
        waited = true;
        clock.advance(minutes * 60_000);
      }
      return await ask(question, signal);
    } finally {
      signal?.removeEventListener('abort', withdrawn);
    }
  };
  return { operator, withdrawals };
};

/** How the session's time limit ends a step that waits on the operator, where no rail is read. */
describe('the time limit of a session waiting on the operator', () => {
  it('[BRW-4] withdraws the open question as the session’s time being up, asks nothing more, and ends the session max-minutes, never operator-stop', async () => {
    const clock = new FixedClock();
    // The limit comes while the first question is open, and nobody answers it. The specs' rails
    // declare no unit grace: the limit is the limit whatever is open, as before the grace existed.
    const { operator, withdrawals } = slowOperator(clock, SPEC_RAILS.maxMinutes, [
      'Yes',
      'Yes',
      'Yes',
    ]);
    const { outcome, detail } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator,
      clock,
      // Every kind asks, so the form has more than one question for the operator — only the first is put.
      answering: answeringFixture(['stated', 'inferred']),
    });
    expect(outcome.termination.reason).toBe('max-minutes');
    expect(outcome.status).toBe('stopped');
    expect(withdrawals).toEqual([OUT_OF_TIME]);
    expect(operator.questions).toHaveLength(1);
    expect(detail).toMatchObject({ terminationReason: 'max-minutes' });
  });

  it('[BRW-4] leaves a session that ends before its limit unbothered: the timer is cancelled with the session', async () => {
    const clock = new FixedClock();
    const { outcome } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      lines: ['Yes'],
      clock,
      rails: { targetDone: 1 },
    });
    expect(outcome.termination.reason).toBe('target-reached');
    // The session closed takes its timer with it: nothing is left to fire when the limit passes.
    expect(clock.pendingTimers).toBe(0);
  });
});

/** A unit of work open when the time runs out may finish within the declared grace; no unit starts after the limit. */
describe('the grace of a unit open when the time runs out', () => {
  const GRACE = { unitGraceMinutes: 30 };

  it('[BRW-28] lets the open unit finish: nothing is withdrawn at the limit, the unit closes done, and the session ends max-minutes once no unit is open', async () => {
    const clock = new FixedClock();
    const { operator, withdrawals } = slowOperator(clock, SPEC_RAILS.maxMinutes, ['Yes']);
    const { outcome, detail, brain } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator,
      clock,
      rails: GRACE,
    });
    expect(withdrawals).toEqual([]);
    expect(operator.questions).toHaveLength(1);
    expect(detail.tasks.map((task) => task.outcome)).toEqual(['done']);
    expect(outcome.termination.reason).toBe('max-minutes');
    expect(outcome.termination.detail).toContain(', no unit of work open');
    // The rails ended the session after the unit closed: no further plan was asked for.
    expect(brain.planInputs).toHaveLength(4);
    expect(clock.pendingTimers).toBe(0);
  });

  it('[BRW-28] starts no unit once the time is up: a plan that closes its unit within the grace and opens the next stops at the taskStart, and the session ends there', async () => {
    const clock = new FixedClock();
    const { operator } = slowOperator(clock, SPEC_RAILS.maxMinutes, ['Yes']);
    const { outcome, detail, events, browser } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, nextUnitPlan([])].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator,
      clock,
      rails: GRACE,
    });
    expect(detail.tasks.map((task) => task.outcome)).toEqual(['done']);
    expect(events.published.map((event) => event.topic)).toEqual([
      SESSION_TOPICS.started,
      SESSION_TOPICS.unitOpened,
      SESSION_TOPICS.unitClosed,
      SESSION_TOPICS.ended,
    ]);
    // Nothing after the refused taskStart ran: the clicks are the search, the listing and the first form's send.
    expect(browser.calls.filter((call) => call.startsWith('click'))).toEqual([
      'click e2',
      'click e1',
      'click e6',
    ]);
    expect(outcome.termination.reason).toBe('max-minutes');
  });

  it('[BRW-28] withdraws a question waiting at the limit when no unit of work is open, whatever the grace', async () => {
    const clock = new FixedClock();
    const { operator, withdrawals } = slowOperator(clock, SPEC_RAILS.maxMinutes, ['Yes']);
    // The listing's link is followed with no unit opened: the form is asked outside any unit.
    const results = {
      ...PLANS.results,
      actions: PLANS.results.actions.filter((action) => action.kind !== 'taskStart'),
    };
    const { outcome, detail } = await run({
      script: {
        plans: [PLANS.search, results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator,
      clock,
      rails: GRACE,
    });
    expect(withdrawals).toEqual([OUT_OF_TIME]);
    expect(detail.tasks).toEqual([]);
    expect(outcome.termination.reason).toBe('max-minutes');
    expect(outcome.termination.detail).toContain(', no unit of work open');
  });

  it('[BRW-28] leaves a session whose unit closes past the limit out of time at once: a question its plan asks after the close is never put', async () => {
    const clock = new FixedClock();
    const { operator } = slowOperator(clock, SPEC_RAILS.maxMinutes, ['Yes', 'No']);
    const common = { reason: 'the procedure says so', expect: null, serves: [] };
    // On the form, past the limit: the unit closes, and the same plan asks a field again.
    const closeThenAsk = {
      assessment: 'the application was sent; one more question on the page',
      actions: [
        { kind: 'taskDone' as const, outcome: 'done' as const, detail: 'sent', ...common },
        { kind: 'askFields' as const, refs: ['e2'], ...common },
      ],
    };
    const again = {
      ...ANSWERS,
      fields: ANSWERS.fields.map((field) =>
        field.ref === 'e2' ? { ...field, value: 'No' } : field,
      ),
    };
    const { outcome, detail } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.formOnly, closeThenAsk].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS), decidedAnswers(again)],
      },
      operator,
      clock,
      rails: GRACE,
    });
    // The one question put was the first, while the unit was open; the one after the close never went out.
    expect(operator.questions).toHaveLength(1);
    expect(detail.tasks.map((task) => task.outcome)).toEqual(['done']);
    expect(outcome.termination.reason).toBe('max-minutes');
    expect(clock.pendingTimers).toBe(0);
  });

  it('[BRW-28] withdraws the question waiting on the operator once the grace runs out, and ends the session naming the grace with the unit still open', async () => {
    const clock = new FixedClock();
    const { operator, withdrawals } = slowOperator(
      clock,
      SPEC_RAILS.maxMinutes + GRACE.unitGraceMinutes,
      ['Yes'],
    );
    const { outcome, detail } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS)],
      },
      operator,
      clock,
      rails: GRACE,
    });
    expect(withdrawals).toEqual([OUT_OF_TIME]);
    expect(operator.questions).toHaveLength(1);
    expect(outcome.termination.reason).toBe('max-minutes');
    expect(outcome.termination.detail).toContain(
      'past the 30-minute grace of the unit of work still open',
    );
    expect(detail.tasks.map((task) => task.status)).toEqual(['open']);
  });
});
