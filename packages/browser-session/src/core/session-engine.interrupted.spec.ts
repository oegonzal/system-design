import { SESSION_TOPICS } from '@sysdesign/contracts';

import type { NewSession } from './ports';
import { decidedAnswers, decidedPlan, InMemoryLedger, ScriptedBrain } from './testing';
import { JOURNEY_ANSWERS as ANSWERS, JOURNEY_PLANS as PLANS } from './testing-journey';
import { FakeStopSignal, runScripted as run, SPEC_RAILS, SPEC_SUBJECT } from './testing-session';

/** Where the spec clock starts: the instant the session under test opens. */
const START = new Date('2026-10-03T10:00:00.000Z');

/** The whole journey, ending on the mission's own stop. */
const JOURNEY = {
  script: {
    plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
      decidedPlan(p),
    ),
    answers: [decidedAnswers(ANSWERS)],
  },
  lines: ['Yes'],
};

/** A session another process opened, which last beat at `lastBeat`. */
const leftRunning = (id: string, lastBeat: Date): NewSession => ({
  id,
  dumpRunId: `dump-${id}`,
  goalPath: 'goals/test.md',
  goalHash: 'h',
  goalMarkdown: '# another mission',
  profile: 'spec',
  subject: SPEC_SUBJECT,
  headed: false,
  limits: SPEC_RAILS,
  startedAt: lastBeat,
});

describe('a session that starts', () => {
  it('[BRW-19] closes every session another process left running and then stopped beating for, as interrupted and finished at its last beat, says so, and never touches one alive beside it', async () => {
    const ledger = new InMemoryLedger();
    await ledger.openSession(leftRunning('dead', new Date(START.getTime() - 3_600_000)));
    await ledger.openSession(leftRunning('alive', new Date(START.getTime() - 10_000)));

    const { outcome, logs } = await run({ ...JOURNEY, ledger });
    expect(outcome.status).toBe('complete');
    expect(await ledger.getSession('dead')).toMatchObject({
      status: 'failed',
      terminationReason: 'interrupted',
      terminationCause: null,
      terminationDetail: 'stopped beating at 2026-10-03T09:00:00.000Z without closing',
      finishedAt: '2026-10-03T09:00:00.000Z',
    });
    expect(await ledger.getSession('alive')).toMatchObject({
      status: 'running',
      terminationReason: null,
      finishedAt: null,
    });
    expect(logs).toContain(
      'closed 1 session(s) that stopped beating without closing, as interrupted',
    );

    // Nothing left stranded: the next session to start has nothing to close, and says nothing.
    const again = await run({ ...JOURNEY, ledger });
    expect(again.logs.filter((line) => line.startsWith('closed '))).toEqual([]);
  });

  it('[BRW-19] a ledger that cannot close them is one warning, and the session runs as it would have', async () => {
    const ledger = new InMemoryLedger();
    vi.spyOn(ledger, 'failStale').mockRejectedValue(new Error('pool exhausted'));
    const { outcome, warnings } = await run({ ...JOURNEY, ledger });
    expect(outcome.status).toBe('complete');
    expect(warnings).toContain('sessions that stopped beating were not closed — pool exhausted');
  });
});

describe('a session told to stop', () => {
  it('[BRW-4] starts no unit of work in the step in flight: a taskStart planned while the stop came is not run, nor anything after it, and the session ends operator-stop with no unit left open', async () => {
    const stop = new FakeStopSignal();
    // Ctrl-C while the results page's plan is composed: the plan comes back after the stop.
    const planStep = ScriptedBrain.prototype.planStep;
    vi.spyOn(ScriptedBrain.prototype, 'planStep').mockImplementation(async function (
      this: ScriptedBrain,
      input,
    ) {
      const plan = await planStep.call(this, input);
      if (this.planInputs.length === 2) stop.press();
      return plan;
    });
    const { outcome, detail, events, browser, logs } = await run({
      script: { plans: [PLANS.search, PLANS.results].map((p) => decidedPlan(p)) },
      stop,
    });
    expect(outcome.termination.reason).toBe('operator-stop');
    expect(detail.tasks).toEqual([]);
    expect(events.published.map((event) => event.topic)).toEqual([
      SESSION_TOPICS.started,
      SESSION_TOPICS.ended,
    ]);
    // The search ran; the click that would have followed the taskStart never did.
    expect(browser.calls.filter((call) => call.startsWith('click'))).toEqual(['click e2']);
    expect(logs).toContainEqual(
      expect.stringContaining('no unit of work starts — the session is stopping'),
    );
  });
});
