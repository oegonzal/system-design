import { BROWSER_SESSION_PIPELINES, FAKE_RUBRIC, type StepPlan } from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan, FakeBrowser, InMemoryLedger, refusing } from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages as pages,
  JOURNEY_URLS,
} from './testing-journey';
import { runScripted as run, SPEC_SUBJECT } from './testing-session';

/**
 * The engine over the scripted journey: what it records, what it asks, what
 * it writes. How a plan stops and how a session ends are in
 * `session-engine.stops.spec.ts`; what the next plan is told about the last
 * step is in `session-engine.handoff.spec.ts`.
 */
describe('the session engine', () => {
  it('[BRW-1] runs a mission to its declared end with every decision a recorded run, and the engine adding only its bookkeeping', async () => {
    const { outcome, brain, detail, browser } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      replies: [{ kind: 'answer', text: 'Yes' }],
    });
    expect(outcome.status).toBe('complete');
    // The mission's own stop ended it, in the status the mission declares for it.
    expect(outcome.termination).toEqual({
      reason: 'mission-stop',
      cause: 'mission-complete',
      ending: 'complete',
      detail: 'nothing left',
    });
    expect(outcome.steps).toBe(5);
    expect(detail.status).toBe('complete');
    expect(detail.terminationReason).toBe('mission-stop');
    expect(detail.terminationCause).toBe('mission-complete');

    const plans = detail.decisions.filter((d) => d.kind === 'step-plan');
    expect(plans).toHaveLength(5);
    expect(
      plans.every((d) => d.source === 'loop' && d.loopRunId?.startsWith('fake-browser-step')),
    ).toBe(true);
    const end = detail.decisions.find((d) => d.kind === 'termination');
    expect(end?.source).toBe('loop');
    expect(end?.loopRunId).toBe(plans[4]?.loopRunId);
    expect(detail.decisions.filter((d) => d.source === 'engine')).toEqual([]);

    // The same rubric on every request, derived once per pipeline.
    expect(brain.derived.map((d) => d.pipeline)).toEqual([
      BROWSER_SESSION_PIPELINES.plan,
      BROWSER_SESSION_PIPELINES.answer,
    ]);
    expect(
      brain.planInputs.every((input) => input.criteria === brain.planInputs[0]?.criteria),
    ).toBe(true);
    expect(brain.planInputs[0]?.criteria).toEqual(FAKE_RUBRIC);
    expect(brain.fieldInputs[0]?.criteria).toEqual(FAKE_RUBRIC);
    // The next plan is told what ran, with refs named by role and name.
    expect(brain.planInputs[1]?.history.map((h) => [h.action, h.outcome])).toEqual([
      ['fill searchbox "Search" with "software engineer"', 'ok'],
      ['click button "Search"', 'ok'],
    ]);
    expect(brain.planInputs[2]?.ledger.openTask?.label).toBe('Senior Engineer at Acme');
    // The form step's note counts the field the operator was asked about as asked,
    // although its row became a fill once the operator answered.
    expect(brain.planInputs[3]?.history.map((h) => h.note).join('\n')).toMatch(
      /3 field\(s\): \d filled, \d kept, 1 asked \(1 answered by the operator\), \d blank/,
    );
    // Once closed, the unit is listed to the next plan by label and outcome, and counted.
    expect(brain.planInputs[4]?.ledger).toMatchObject({
      openTask: null,
      closed: [{ label: 'Senior Engineer at Acme', outcome: 'done' }],
      closedOmitted: 0,
      counts: { done: 1, 'already-done': 0, skipped: 0, failed: 0 },
    });
    expect(browser.calls).toEqual(
      expect.arrayContaining([
        'fill e1',
        'click e2',
        'click e1',
        'highlight e2',
        'select e2',
        'click e6',
        'close',
      ]),
    );
    expect(browser.closed).toBe(true);
  });

  it('[BRW-1] settles a progress criterion the evaluator passed once a whole plan moved the page: out of the next rubric for the session, listed as done and still graded inside a unit, cleared when the unit closes', async () => {
    // Measured 2026-10-07: the criterion for the mission's first step was
    // failed by the evaluator on six pages after it had been taken, and
    // passed for twelve re-navigations to the page it was taken on.
    const { brain } = await run({
      script: {
        plans: [
          // The search ran whole and the page moved: c1 settles for the session.
          decidedPlan(PLANS.search, { passed: ['c1', 'c2'] }),
          // Inside the unit the form step passes: done for the unit, still graded.
          decidedPlan(PLANS.results, { passed: ['c3'] }),
          decidedPlan(PLANS.form),
          decidedPlan(PLANS.done),
          decidedPlan(PLANS.end),
        ],
        answers: [decidedAnswers(ANSWERS)],
      },
      replies: [{ kind: 'answer', text: 'Yes' }],
    });
    const inputs = brain.planInputs;
    expect(inputs[0]?.progress).toEqual({ settled: [], done: [] });
    expect(inputs[0]?.criteria.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    // c1 is a progress criterion: settled. c2 is a never-do line: never settled.
    expect(inputs[1]?.progress).toEqual({ settled: ['c1'], done: [] });
    // The unit opened at step 2 and its plan passed c3 with the page moving: done in the unit.
    expect(inputs[2]?.progress).toEqual({ settled: ['c1'], done: ['c3'] });
    expect(inputs[3]?.progress).toEqual({ settled: ['c1'], done: ['c3'] });
    // The unit closed at step 4: its progress is cleared, the session's stays.
    expect(inputs[4]?.progress).toEqual({ settled: ['c1'], done: [] });
    // The session hands the brain the whole rubric; the brain is what omits the settled.
    expect(inputs[4]?.criteria).toEqual(inputs[0]?.criteria);
  });

  it('[BRW-1] settles the passes the actions that ran said they served, even when a later action of the plan failed', async () => {
    // Measured 2026-10-07: a plan's last click timed out after its first click
    // had opened the listing, and the criteria that click earned were failed
    // on nine pages after.
    const clickThenFill: StepPlan = {
      ...PLANS.search,
      actions: [
        { kind: 'click', ref: 'e2', reason: 'open the results', expect: null, serves: ['c1'] },
        { kind: 'fill', ref: 'e1', value: 'x', reason: 'refine', expect: null, serves: [] },
      ],
    };
    const { brain } = await run({
      script: {
        plans: [decidedPlan(clickThenFill, { passed: ['c1', 'c3'] }), decidedPlan(PLANS.end)],
      },
      browser: refusing(new FakeBrowser(pages()), 'fill', 'results'),
    });
    // c1 was served by the click that ran, and the page moved; c3 was served by nothing that ran.
    expect(brain.planInputs[1]?.progress).toEqual({ settled: ['c1'], done: [] });
    // The click ran and the fill failed: one action ran, and nothing was held past the failure.
    expect(brain.planInputs[1]?.lastStep).toMatchObject({ ran: 1, held: [] });
  });

  it('[BRW-1] a pass on a plan that did not move the page settles nothing', async () => {
    const press: StepPlan = {
      ...PLANS.search,
      actions: [{ kind: 'press', key: 'Tab', reason: 'move the focus', expect: null, serves: [] }],
    };
    const { brain } = await run({
      script: {
        plans: [decidedPlan(press, { passed: ['c1'] }), decidedPlan(PLANS.end)],
      },
    });
    expect(brain.planInputs[1]?.progress).toEqual({ settled: [], done: [] });
  });

  it('[BRW-1] a plan that closes a unit settles nothing, even when it opens the next unit and moves the page', async () => {
    // Measured 2026-10-07: a listing found already applied to is closed and
    // the next one opened in one plan. What that plan passed was the closed
    // unit's; settling it onto the new unit — or, with no unit open before or
    // after, onto the session — would credit work that unit never did.
    const closeAndGoOn: StepPlan = {
      ...PLANS.results,
      actions: [
        {
          kind: 'taskStart',
          label: 'Senior Engineer at Acme',
          url: JOURNEY_URLS.listing,
          reason: 'the unit begins',
          expect: null,
          serves: [],
        },
        {
          kind: 'taskDone',
          outcome: 'already-done',
          detail: 'applied before',
          reason: 'the pane reports the application was sent',
          expect: null,
          serves: ['c3'],
        },
        // A taskStart claims the page as observed, so it comes before the click, never after.
        {
          kind: 'taskStart',
          label: 'Staff Engineer at Globex',
          url: JOURNEY_URLS.listing,
          reason: 'the next unit begins',
          expect: null,
          serves: [],
        },
        { kind: 'click', ref: 'e1', reason: 'open the next listing', expect: null, serves: [] },
      ],
    };
    const { brain } = await run({
      script: {
        plans: [
          decidedPlan(PLANS.search, { passed: ['c1'] }),
          decidedPlan(closeAndGoOn, { passed: ['c3'] }),
          decidedPlan(PLANS.end),
        ],
      },
    });
    // The page moved (the click opened the form) and the plan ran whole, yet c3 is settled nowhere.
    expect(brain.planInputs[2]?.progress).toEqual({ settled: ['c1'], done: [] });
    expect(brain.planInputs[2]?.ledger.openTask?.label).toBe('Staff Engineer at Globex');
    expect(brain.planInputs[2]?.ledger.counts['already-done']).toBe(1);
  });

  it('[BRW-3] routes fields by the declared table, fills the operator answer, caches it, teaches it back and stamps the orchestration on its rows', async () => {
    const { detail, brain, operator, dumps, ledger } = await run({
      script: {
        plans: [
          PLANS.search,
          PLANS.results,
          PLANS.formOnly,
          PLANS.formAgain,
          PLANS.done,
          PLANS.end,
        ].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS), decidedAnswers(ANSWERS)],
      },
      replies: [{ kind: 'answer', text: 'Yes' }],
    });
    const fields = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(fields.map((d) => [d.ref, d.source, d.answer, d.confidence])).toEqual([
      ['e1', 'memory', '6', 'high'],
      ['e2', 'operator', 'Yes', 'low'],
      ['e3', 'blank', null, 'high'],
    ]);
    expect(fields[2]?.payload['reason']).toContain('trap-skipped');
    expect(fields.every((d) => d.loopRunId !== null && d.loopOrchestrationId !== null)).toBe(true);
    // The operator saw the suggestion and why it was not trusted, once.
    expect(operator.prompts).toHaveLength(1);
    expect(operator.prompts[0]?.field.name).toBe('Work authorisation');
    expect(operator.prompts[0]?.suggestion).toBe('Yes');
    expect(operator.prompts[0]?.why).toContain('low confidence');
    // The second form did not ask again: the cache answered, and the row says so.
    const again = detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 4);
    expect(again?.source).toBe('operator');
    expect(again?.payload['cached']).toBe(true);
    // One guidance document the moment the operator answered, naming the field and the answer.
    expect(brain.taught).toHaveLength(1);
    expect(brain.taught[0]?.subject).toBe(SPEC_SUBJECT);
    expect(brain.taught[0]?.parts[0]).toContain('"Work authorisation"');
    expect(brain.taught[0]?.parts[0]).toContain('the operator answered "Yes"');
    // The teaching lands on the row the answer came from — not on the cached fill, which taught nothing new.
    expect(fields[1]?.teachOrchestrationId).toBe('fake-teach-1');
    expect(again?.teachOrchestrationId).toBeNull();
    expect(ledger.teachings).toEqual([
      { decisionIds: [fields[1]?.id], orchestrationRunId: 'fake-teach-1' },
    ]);
    expect(dumps.text('01-steps/03/teach.json')).toContain('fake-teach-1');
    expect(dumps.files.has('01-steps/03/fields.json')).toBe(true);
  });

  it('[BRW-3] reads the field back when the operator fills the page and presses Enter, caches that answer and teaches it', async () => {
    const browser = new FakeBrowser(pages());
    // The operator types into the highlighted field while the terminal waits.
    browser.highlight = async (ref) => {
      browser.calls.push(`highlight ${ref}`);
      browser.values.set(ref, 'No');
    };
    const { detail, brain } = await run({
      script: {
        plans: [
          PLANS.search,
          PLANS.results,
          PLANS.formOnly,
          PLANS.formAgain,
          PLANS.done,
          PLANS.end,
        ].map((p) => decidedPlan(p)),
        answers: [decidedAnswers(ANSWERS), decidedAnswers(ANSWERS)],
      },
      replies: [{ kind: 'read-back' }],
      browser,
    });
    const asked = detail.decisions.find(
      (d) => d.kind === 'field-answer' && d.step === 3 && d.ref === 'e2',
    );
    expect(asked).toMatchObject({ source: 'operator', answer: 'No' });
    expect(asked?.payload).toMatchObject({ reply: 'read-back', route: 'fill', cached: false });
    // The operator did the first fill; only the cached answer on the next form went through the browser.
    expect(browser.calls.filter((call) => call === 'select e2')).toHaveLength(1);
    const again = detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 4);
    expect(again).toMatchObject({ source: 'operator', answer: 'No' });
    expect(again?.payload['cached']).toBe(true);
    expect(brain.taught).toHaveLength(1);
    expect(brain.taught[0]?.parts[0]).toContain('the operator answered "No"');
    expect(asked?.teachOrchestrationId).toBe('fake-teach-1');
  });

  it('[BRW-5] writes rows through the queue so a failing write is reported, not thrown, and the session still closes', async () => {
    const ledger = new InMemoryLedger();
    ledger.recordDecision = async () => {
      throw new Error('disk full');
    };
    const { outcome, warnings, detail } = await run({
      script: { plans: [decidedPlan(PLANS.end)] },
      ledger,
    });
    expect(outcome.status).toBe('complete');
    expect(
      warnings.some((w) => w.includes('decision 1.1 not recorded') && w.includes('disk full')),
    ).toBe(true);
    expect(detail.status).toBe('complete');
  });

  it("[BRW-6] writes each step's files as the step happens and the closing files once, in the shared layout", async () => {
    const { dumps, outcome } = await run({
      script: { plans: [PLANS.search, PLANS.end].map((p) => decidedPlan(p)) },
    });
    expect([...dumps.files.keys()].sort()).toEqual([
      '00-rubrics.json',
      '01-steps/01/observation.json',
      '01-steps/01/plan.json',
      '01-steps/01/screenshot.png',
      '01-steps/01/snapshot.txt',
      '01-steps/02/observation.json',
      '01-steps/02/plan.json',
      '01-steps/02/screenshot.png',
      '01-steps/02/snapshot.txt',
      '02-tasks.json',
      'goal.md',
      'manifest.json',
    ]);
    expect(dumps.text('goal.md')).toContain('# Mission');
    // Each pipeline's rubric, beside the loop's dump of the call that derived it.
    expect(JSON.parse(dumps.text('00-rubrics.json'))).toMatchObject({
      'browser-step': { dumpRunId: 'browser-step-criteria-dump' },
      'field-answer': { dumpRunId: 'field-answer-criteria-dump' },
    });
    expect(JSON.parse(dumps.text('01-steps/01/plan.json'))).toMatchObject({
      composition: { rung: 'full' },
      readout: { executable: true, executePrefix: 2 },
    });
    expect(JSON.parse(dumps.text('manifest.json'))).toMatchObject({
      kind: 'session',
      sessionId: outcome.sessionId,
      status: 'complete',
      steps: 2,
    });
    expect(dumps.index).toHaveLength(1);
  });
});
