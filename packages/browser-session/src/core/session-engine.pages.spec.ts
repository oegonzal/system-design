import type { StepPlan } from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan, FakeBrowser, type ScriptedPage } from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages as pages,
  JOURNEY_URLS,
} from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * A unit of work's pages close with it: the journey with the listing's card
 * opening the form on a page of its own, as a link with target=_blank does,
 * and the form's submit opening the done page over that.
 */
const pagesOpening = (): ScriptedPage[] =>
  pages().map((page) => {
    if (page.id === 'results') return { ...page, transitions: {}, opens: { 'click e1': 'form' } };
    if (page.id === 'form') return { ...page, transitions: {}, opens: { 'click e6': 'done' } };
    return page;
  });

const journey = (done: StepPlan = PLANS.done) => ({
  plans: [PLANS.search, PLANS.results, PLANS.form, done, PLANS.end].map((p) => decidedPlan(p)),
  answers: [decidedAnswers(ANSWERS)],
});

describe('the session engine and the pages a unit opens', () => {
  it('[BRW-25] closes the pages a unit opened after the plan that closed it, tells the next plan, and observes the page the unit was taken from', async () => {
    const browser = new FakeBrowser(pagesOpening());
    const { brain, outcome } = await run({ script: journey(), lines: ['Yes'], browser });
    expect(outcome.status).toBe('complete');
    expect(browser.calls).toContain('closeOpenedPages 2');
    const next = brain.planInputs[4];
    expect(next?.history.at(-1)).toEqual({
      action: 'closed 2 page(s) the unit opened',
      outcome: 'ok',
      note: `the page in front is ${JOURNEY_URLS.results}`,
    });
    expect(next?.observation.url).toBe(JOURNEY_URLS.results);
    expect(next?.pageUnchanged).toBe(false);
  });

  it("[BRW-25] drops the last action's promise about a page now gone rather than counting it unmet", async () => {
    const browser = new FakeBrowser(pagesOpening());
    const doneThenNavigate: StepPlan = {
      ...PLANS.done,
      actions: [
        ...PLANS.done.actions,
        {
          kind: 'navigate',
          url: JOURNEY_URLS.done,
          reason: 'the procedure says so',
          expect: 'the confirmation',
          serves: [],
        },
      ],
    };
    const { brain, detail } = await run({
      script: journey(doneThenNavigate),
      lines: ['Yes'],
      browser,
    });
    const history = brain.planInputs[4]?.history ?? [];
    expect(history.filter((h) => h.outcome === 'failed')).toEqual([]);
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining([
        'taskDone done',
        `navigate ${JOURNEY_URLS.done}`,
        'closed 2 page(s) the unit opened',
      ]),
    );
    expect(detail.status).toBe('complete');
  });

  it('[BRW-25] changes nothing for a session whose units open no page: nothing closed, no history line', async () => {
    const { brain, browser, outcome } = await run({ script: journey(), lines: ['Yes'] });
    expect(outcome.status).toBe('complete');
    expect(browser.calls).toContain('closeOpenedPages 0');
    expect(browser.calls.filter((c) => c.startsWith('closeOpenedPages'))).toEqual([
      'closeOpenedPages 0',
    ]);
    expect(
      brain.planInputs
        .flatMap((input) => input.history)
        .some((h) => h.action.startsWith('closed ')),
    ).toBe(false);
  });
});
