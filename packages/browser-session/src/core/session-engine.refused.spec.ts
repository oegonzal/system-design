import { ActionFailed, type BrowserAction, type OperatorQuestion } from './ports';
import {
  actionKey,
  decidedAnswers,
  decidedPlan,
  FakeBrowser,
  refusing,
  ScriptedOperator,
} from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages,
} from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * An operator's answer the page refuses, over the scripted journey: the form's
 * work-authorisation select goes to the operator, and the page refuses what
 * is chosen — once, as a disabled option would, or every time.
 */

const script = () => ({
  plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
    decidedPlan(p),
  ),
  answers: [decidedAnswers(ANSWERS)],
});

const authorisation = (questions: readonly OperatorQuestion[]) =>
  questions.filter((question) => question.prompt.title === 'Work authorisation');

/** A browser whose first select is refused, as one on an option the page disables. */
const refusingOnce = (): FakeBrowser => {
  const browser = new FakeBrowser(journeyPages());
  const act = browser.act.bind(browser);
  let refusals = 1;
  browser.act = async (action: BrowserAction) => {
    if (action.kind === 'select' && refusals > 0) {
      refusals -= 1;
      throw new ActionFailed(actionKey(action), 'option being selected is not enabled');
    }
    return act(action);
  };
  return browser;
};

describe('an answer the page refuses', () => {
  it('[BRW-3] is put back to the operator with why, not offered again, and what they then fix in the browser is read back, kept and taught', async () => {
    const browser = refusingOnce();
    const operator = new ScriptedOperator(['No', '']);
    const ask = operator.ask.bind(operator);
    // Asked again, the operator chooses in the page itself, then reads it back.
    operator.ask = (question, signal) => {
      if (authorisation(operator.questions).length === 1) browser.values.set('e2', 'No');
      return ask(question, signal);
    };
    const { detail, brain } = await run({ script: script(), operator, browser });
    const [first, again] = authorisation(operator.questions);
    expect(first?.prompt.choices[0]?.note).toMatch(/^the answerer's pick/);
    expect(again?.prompt.details).toContainEqual(
      expect.stringContaining(
        'the page refused "No" (select e2: option being selected is not enabled): choose again, or fill it in the browser and read it back',
      ),
    );
    expect(again?.prompt.choices.map((choice) => choice.note)).toEqual([null, null]);
    const step3 = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(step3.map((d) => [d.ref, d.source, d.answer])).toEqual([
      ['e1', 'memory', '6'],
      ['e2', 'operator', 'No'],
      ['e3', 'blank', null],
    ]);
    expect(step3[1]?.payload).toMatchObject({ reply: 'read-back', outcome: 'ok' });
    expect(brain.taught).toHaveLength(1);
    expect(brain.taught[0]?.answers[0]?.answer).toBe('No');
  });

  it('[BRW-3] stands once the declared asks are spent, and the fields after it are not attempted', async () => {
    const browser = refusing(new FakeBrowser(journeyPages()), 'select', 'form');
    const { detail, operator, brain, logs } = await run({
      script: script(),
      lines: ['No', 'Yes'],
      browser,
      asksAfterRefusal: 1,
    });
    expect(authorisation(operator.questions)).toHaveLength(2);
    const step3 = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(step3.map((d) => [d.ref, d.source, d.payload['outcome']])).toEqual([
      ['e1', 'memory', 'ok'],
      ['e2', 'operator', 'failed'],
    ]);
    expect(brain.taught).toEqual([]);
    // A refusal after a field was filled is a step that ran, not one failed step toward the limit.
    expect(logs.filter((line) => line.includes('action-failed'))).toEqual([]);
  });
});
