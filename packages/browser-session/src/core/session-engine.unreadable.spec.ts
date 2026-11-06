import { SESSION_TOPICS, type StepPlan } from '@sysdesign/contracts';

import { decidedPlan, FakeBrowser } from './testing';
import { JOURNEY_PLANS as PLANS, journeyPages } from './testing-journey';
import { runScripted as run, SPEC_RAILS } from './testing-session';

/** A plan that only waits on a page it cannot read: what a planner does with nothing listed. */
const waiting: StepPlan = {
  assessment: 'the page listed nothing readable; waiting for it to read',
  actions: [
    {
      kind: 'scroll',
      direction: 'down',
      ref: null,
      reason: 'let it read',
      expect: null,
      serves: [],
    },
  ],
};

/** A browser whose form page answers no read: every element of it unread, as a frame-heavy page answered. */
const unreadableForm = (): FakeBrowser => {
  const browser = new FakeBrowser(journeyPages());
  const observe = browser.observe.bind(browser);
  browser.observe = async () => {
    const observation = await observe();
    return browser.pageId === 'form'
      ? { ...observation, elements: [], unread: { elements: 117, snapshotLines: 0 } }
      : observation;
  };
  return browser;
};

describe('a page that will not read inside a unit of work', () => {
  it('[BRW-4] closes the unit failed, saying why, and the session goes on from the page after it rather than ending page-unreadable', async () => {
    const { outcome, detail, events, logs } = await run({
      script: {
        plans: [
          PLANS.search,
          PLANS.results,
          ...Array.from({ length: SPEC_RAILS.maxUnreadablePages - 1 }, () => waiting),
          PLANS.end,
        ].map((plan) => decidedPlan(plan)),
      },
      browser: unreadableForm(),
    });
    expect(outcome.termination.reason).not.toBe('page-unreadable');
    expect(detail.tasks.map((task) => [task.label, task.outcome])).toEqual([
      ['Senior Engineer at Acme', 'failed'],
    ]);
    expect(events.published.map((event) => event.topic)).toEqual([
      SESSION_TOPICS.started,
      SESSION_TOPICS.unitOpened,
      SESSION_TOPICS.unitClosed,
      SESSION_TOPICS.ended,
    ]);
    expect(logs.join('\n')).not.toContain('page-unreadable');
  });

  it('[BRW-4] still ends the session page-unreadable when no unit of work is open', async () => {
    const browser = new FakeBrowser(journeyPages());
    const observe = browser.observe.bind(browser);
    browser.observe = async () => ({
      ...(await observe()),
      elements: [],
      unread: { elements: 40, snapshotLines: 0 },
    });
    const { outcome, detail } = await run({
      script: {
        plans: Array.from({ length: SPEC_RAILS.maxUnreadablePages - 1 }, () =>
          decidedPlan(waiting),
        ),
      },
      browser,
    });
    expect(outcome.termination.reason).toBe('page-unreadable');
    expect(detail.tasks).toEqual([]);
  });
});
