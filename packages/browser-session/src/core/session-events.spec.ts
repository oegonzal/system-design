import { SESSION_TOPICS, type SessionUnitOpened } from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan, FakeBrowser, RecordingEvents } from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages as pages,
  JOURNEY_URLS,
} from './testing-journey';
import {
  FakeStopSignal,
  runScripted as run,
  SPEC_EVENTS_DRAIN_MS,
  SPEC_RAILS,
  SPEC_SUBJECT,
} from './testing-session';
import { sessionEventsOf } from './session-events';
import { FixedClock } from './testing-clock';

const JOURNEY = [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((plan) =>
  decidedPlan(plan),
);

describe('what a session says happened', () => {
  it('[BRW-15] says it in order — started, the unit opened and closed by the row’s own id with its identity and the session’s lifetime, ended — and the same again from its rows', async () => {
    const { outcome, events, detail } = await run({
      script: { plans: JOURNEY, answers: [decidedAnswers(ANSWERS)] },
      lines: ['Yes'],
    });
    expect(events.published.map((event) => event.topic)).toEqual([
      SESSION_TOPICS.started,
      SESSION_TOPICS.unitOpened,
      SESSION_TOPICS.unitClosed,
      SESSION_TOPICS.ended,
    ]);
    const session = { sessionId: outcome.sessionId, subject: SPEC_SUBJECT, profile: 'spec' };
    expect(events.published[0]?.payload).toEqual(session);
    const opened = events.published[1]?.payload as SessionUnitOpened;
    expect(opened).toEqual({
      ...session,
      maxMinutes: SPEC_RAILS.maxMinutes,
      unit: {
        id: detail.tasks[0]?.id,
        ordinal: 1,
        label: 'Senior Engineer at Acme',
        url: JOURNEY_URLS.listing,
        facets: [],
      },
    });
    expect(events.published[2]?.payload).toEqual({ ...opened, outcome: 'done' });
    expect(events.published[3]?.payload).toEqual({ sessionId: outcome.sessionId });
    // A replay from the rows is the same four events: a record that missed them catches up on nothing new.
    expect(sessionEventsOf({ ...detail, subject: SPEC_SUBJECT })).toEqual(events.published);
  });

  it('[BRW-15] a bus that refuses is a warning per event, never a failure of the session', async () => {
    const events = new RecordingEvents();
    events.failing = new Error('bus down');
    const { outcome, warnings, dumps } = await run({
      script: { plans: [decidedPlan(PLANS.end)] },
      events,
    });
    expect(outcome.status).toBe('complete');
    expect(warnings.filter((w) => w.includes('not published'))).toEqual([
      expect.stringMatching(/event 1 session\.started not published — bus down$/),
      expect.stringMatching(/event 2 session\.ended not published — bus down$/),
    ]);
    // Refused is settled: nothing is left unsent for the close to wait on.
    expect(JSON.parse(dumps.text('manifest.json')).unsentEvents).toEqual([]);
  });

  it('[BRW-15] waits one window for the last events, then records what stayed unsent rather than waiting for good', async () => {
    const events = new RecordingEvents();
    events.held = new Promise<void>(() => undefined);
    // The window is the session's clock's: time passes on it while the close waits.
    const clock = new FixedClock();
    const arm = clock.at.bind(clock);
    const fired: Date[] = [];
    clock.at = (when, then) =>
      arm(when, () => {
        fired.push(when);
        then();
      });
    const ticking = setInterval(() => clock.advance(SPEC_EVENTS_DRAIN_MS / 5), 1);
    const { outcome, dumps, warnings } = await run({
      script: { plans: [decidedPlan(PLANS.end)] },
      events,
      clock,
    }).finally(() => clearInterval(ticking));
    expect(outcome.status).toBe('complete');
    // The close waited out its window — the one timer that fired — and left none armed.
    expect(fired).toHaveLength(1);
    expect(clock.pendingTimers).toBe(0);
    expect(JSON.parse(dumps.text('manifest.json')).unsentEvents).toEqual([
      'event 1 session.started',
      'event 2 session.ended',
    ]);
    expect(warnings).toContainEqual(
      expect.stringContaining(`2 event(s) not published within ${SPEC_EVENTS_DRAIN_MS} ms`),
    );
  });

  it('[BRW-4] Ctrl-C is the operator’s word: the session ends after the step in flight, through the close, with its end said and the handler released', async () => {
    const stop = new FakeStopSignal();
    const browser = new FakeBrowser(pages());
    const observe = browser.observe.bind(browser);
    browser.observe = async () => {
      const observation = await observe();
      if (browser.pageId === 'results') stop.press();
      return observation;
    };
    const { outcome, brain, events, detail, logs } = await run({
      script: { plans: [decidedPlan(PLANS.search)] },
      browser,
      stop,
    });
    expect(outcome.termination).toEqual({
      reason: 'operator-stop',
      detail: 'the operator ended the session: /stop, or Ctrl-C at the terminal',
    });
    expect([outcome.status, outcome.steps, brain.planInputs.length]).toEqual(['stopped', 2, 1]);
    expect(detail.status).toBe('stopped');
    expect(events.published.map((event) => event.topic)).toEqual([
      SESSION_TOPICS.started,
      SESSION_TOPICS.ended,
    ]);
    expect(logs).toContainEqual(expect.stringContaining('interrupted — ending after this step'));
    expect([browser.closed, stop.listening]).toEqual([true, false]);
  });
});
