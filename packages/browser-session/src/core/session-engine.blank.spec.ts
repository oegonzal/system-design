import { decidedAnswers, decidedPlan } from './testing';
import { JOURNEY_ANSWERS_UNSETTLED, JOURNEY_PLANS as PLANS } from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * The operator's "leave it empty", over the scripted journey: the form's
 * work-authorisation select goes to the operator, who leaves it blank, and the
 * plan asks the same field again in the same unit of work.
 */
describe('a field the operator chose to leave blank', () => {
  it('[BRW-3] is not put to them again in the unit, nor to the brain, and the next plan is told the blank was theirs', async () => {
    // Measured 2026-11-06: a required question left blank was asked twice more, one session waiting 24 minutes on it.
    const { detail, operator, brain } = await run({
      script: {
        plans: [
          PLANS.search,
          PLANS.results,
          PLANS.formOnly,
          PLANS.formAgain,
          PLANS.done,
          PLANS.end,
        ].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(JOURNEY_ANSWERS_UNSETTLED)],
      },
      lines: ['/blank'],
    });
    const rows = detail.decisions.filter((d) => d.kind === 'field-answer' && d.ref === 'e2');
    expect(rows.map((d) => [d.step, d.source, d.payload['route'], d.payload['reply']])).toEqual([
      [3, 'operator', 'leave-blank', 'blank'],
      [4, 'operator', 'leave-blank', null],
    ]);
    expect(rows[1]?.payload['cached']).toBe(true);
    // Asked once; the second ask made no run, the only field it named being already answered.
    expect(operator.questions.map((question) => question.prompt.title)).toEqual([
      'Work authorisation',
    ]);
    expect(brain.fieldInputs).toHaveLength(1);
    const asks = brain.planInputs[4]?.history.filter((h) => h.action.startsWith('askFields'));
    expect(asks?.slice(-1)[0]?.note).toContain(
      '1 blank (1 as the operator chose earlier in this unit of work)',
    );
  });
});
