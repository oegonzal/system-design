import { type StepPlan, finding } from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan } from './testing';
import { JOURNEY_ANSWERS as ANSWERS, JOURNEY_PLANS as PLANS } from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * What the next plan is told about the last step: what ran, by role and name;
 * what was held past it; why a plan made on this page did not run; and where
 * the session opened. Every one of these is an engine fact the goal states,
 * never a judgement.
 */
describe('the hand-off between steps', () => {
  it('[BRW-1] tells the next plan what ran as the page would recognise it again: by role and name, with what it carried', async () => {
    // Measured 2026-10-08: nine of 31 steps were one click on one already-selected
    // card, repeated — a repeat the next goal can only cut if it knows what ran.
    const { brain } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      lines: ['Yes'],
    });
    expect(brain.planInputs[0]?.lastStep).toBeNull();
    expect(brain.planInputs[1]?.lastStep?.touched).toEqual([
      { kind: 'fill', role: 'searchbox', name: 'Search', detail: 'software engineer' },
      { kind: 'click', role: 'button', name: 'Search', detail: null },
    ]);
    // A unit event or a wait has no identity to repeat; the click that opened the listing does.
    expect(brain.planInputs[2]?.lastStep?.touched).toEqual([
      { kind: 'click', role: 'link', name: 'Senior Engineer — Acme', detail: null },
    ]);
  });

  it('[BRW-1] [QL-36] runs a handed-back plan up to the action a cutting validator pointed at, and tells the next plan what was cut and why', async () => {
    // Measured 2026-10-07: six plans in a row were voided whole for a ref at
    // action.2 or action.3 while action.1 was never faulted, and the session
    // never left an empty document. The loop still hands such a plan back;
    // the session runs what nobody objected to and re-observes.
    const cutAtTwo = decidedPlan(PLANS.search, {
      decision: 'escalate',
      validation: [
        {
          validatorId: 'references',
          gate: 'cut',
          problems: [
            {
              severity: 'critical',
              locationRefs: ['action.2'],
              message: 'e2 is not a listed element',
            },
          ],
        },
      ],
    });
    const { brain, browser, outcome } = await run({
      script: { plans: [cutAtTwo, decidedPlan(PLANS.end)], answers: [] },
    });
    expect(outcome.steps).toBe(2);
    expect(browser.calls).toContain('fill e1');
    expect(browser.calls).not.toContain('click e2');
    // The history holds what ran; the cut action is the last step's `held`, and why it was cut is the objection.
    expect(brain.planInputs[1]?.history.map((h) => [h.action, h.outcome, h.note])).toEqual([
      ['fill searchbox "Search" with "software engineer"', 'ok', null],
    ]);
    expect(brain.planInputs[1]?.lastStep).toEqual({
      ran: 1,
      touched: [{ kind: 'fill', role: 'searchbox', name: 'Search', detail: 'software engineer' }],
      held: ['click'],
    });
    expect(brain.planInputs[1]?.objections).toEqual([
      { step: 1, from: 'references', at: ['action.2'], detail: 'e2 is not a listed element' },
    ]);
  });

  it('[BRW-1] objections are about the page they were raised on: a page the last step moved starts with none', async () => {
    // Measured 2026-10-08: a click that opened a listing was followed, step
    // after step, by the last page's "taskStart follows the click" and "open
    // the first card", and the planner clicked a card again, twelve steps of 23.
    const clickThenFill: StepPlan = {
      ...PLANS.search,
      actions: [
        { kind: 'click', ref: 'e2', reason: 'submit the search', expect: null, serves: [] },
        { kind: 'fill', ref: 'e1', value: 'x', reason: 'refine', expect: null, serves: [] },
      ],
    };
    const cutAfterTheClick = decidedPlan(clickThenFill, {
      decision: 'revise',
      validation: [
        {
          validatorId: 'limits',
          gate: 'cut',
          problems: [
            {
              severity: 'high',
              locationRefs: ['action.2'],
              message:
                'fill follows the click at action.1: the page it would act on has not been observed',
            },
          ],
        },
      ],
    });
    const { brain, browser } = await run({
      script: { plans: [cutAfterTheClick, decidedPlan(PLANS.end)], answers: [] },
    });
    expect(browser.pageId).toBe('results');
    // The click moved the page: the cut fill is the last step's `held`, said beside this page,
    // and the objection to it — about a page nobody had seen — is spent.
    expect(brain.planInputs[1]?.objections).toEqual([]);
    expect(brain.planInputs[1]?.lastStep).toEqual({
      ran: 1,
      touched: [{ kind: 'click', role: 'button', name: 'Search', detail: null }],
      held: ['fill'],
    });
  });

  it('[BRW-1] a plan refused whole is one line of history, never one per proposed action', async () => {
    // Measured 2026-10-07: a refused six-action plan wrote six not-executed
    // entries, two refusals filled HISTORY_MAX, and the producer read its own
    // refused "terminate limit-reached" as the session's recent past.
    const refused = decidedPlan(PLANS.search, {
      decision: 'escalate',
      policyAllowed: false,
      findings: [finding('missed_stop', ['assessment'], 'the page shows a stop')],
    });
    const { brain, browser } = await run({
      script: { plans: [refused, decidedPlan(PLANS.end)], answers: [] },
      rails: { maxConsecutiveFailures: 3 },
    });
    expect(browser.calls).not.toContain('fill e1');
    expect(brain.planInputs[1]?.history).toEqual([
      { action: 'plan of 2 action(s): fill, click', outcome: 'not-executed', note: null },
    ]);
    // Why it did not run travels once, as the objection.
    expect(brain.planInputs[1]?.objections.map((o) => [o.from, o.at])).toEqual([
      ['missed_stop', ['assessment']],
    ]);
  });

  it('[BRW-1] opens at the start url before the first plan, so the loop never plans on about:blank', async () => {
    const { browser, brain } = await run({
      script: { plans: [decidedPlan(PLANS.end)] },
      startUrl: 'https://start.test/jobs',
    });
    // The first plan is told the session opened its page, so it does not open it again.
    expect(brain.planInputs[0]?.history).toEqual([
      { action: 'navigate https://start.test/jobs', outcome: 'ok', note: null },
    ]);
    expect(brain.planInputs[0]?.lastStep).toEqual({
      ran: 1,
      touched: [{ kind: 'navigate', role: null, name: null, detail: 'https://start.test/jobs' }],
      held: [],
    });
    const navigate = browser.calls.indexOf('navigate https://start.test/jobs');
    const firstObserve = browser.calls.findIndex((call) => call.startsWith('observe'));
    expect(navigate).toBeGreaterThanOrEqual(0);
    expect(navigate).toBeLessThan(firstObserve);
    // Engine setup, not a planned step: no decision row for it.
    expect(browser.calls[0]).toBe('open spec headless');
    expect(browser.calls[1]).toBe('navigate https://start.test/jobs');
  });

  it('[BRW-1] without a start url, opens straight onto the first observation', async () => {
    const { browser } = await run({ script: { plans: [decidedPlan(PLANS.end)] } });
    expect(browser.calls[0]).toBe('open spec headless');
    expect(browser.calls[1]?.startsWith('observe')).toBe(true);
  });
});
