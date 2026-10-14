import { answeringFixture } from '@sysdesign/contracts';

import { OUT_OF_TIME } from './session-engine';
import { decidedAnswers, decidedPlan, ScriptedOperator } from './testing';
import { FixedClock } from './testing-clock';
import { JOURNEY_ANSWERS as ANSWERS, JOURNEY_PLANS as PLANS } from './testing-journey';
import { runScripted as run, SPEC_RAILS } from './testing-session';

/** How the session's time limit ends a step that waits on the operator, where no rail is read. */
describe('the time limit of a session waiting on the operator', () => {
  it('[BRW-4] withdraws the open question as the session’s time being up, asks nothing more, and ends the session max-minutes, never operator-stop', async () => {
    const clock = new FixedClock();
    const operator = new ScriptedOperator(['Yes', 'Yes', 'Yes']);
    const withdrawals: unknown[] = [];
    const ask = operator.ask.bind(operator);
    // The limit comes while the first question is open, and nobody answers it.
    operator.ask = (question, signal) => {
      signal?.addEventListener('abort', () => withdrawals.push(signal.reason), { once: true });
      clock.advance(SPEC_RAILS.maxMinutes * 60_000);
      return ask(question, signal);
    };
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
