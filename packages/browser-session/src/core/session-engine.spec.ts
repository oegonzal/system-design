import { BROWSER_SESSION_PIPELINES } from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan, FAKE_RUBRIC, FakeBrowser, InMemoryLedger } from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages as pages,
} from './testing-journey';
import { runScripted as run, SPEC_SUBJECT } from './testing-session';

/**
 * The engine over the scripted journey: what it records, what it asks, what
 * it writes. How a plan stops and how a session ends are in
 * `session-engine.stops.spec.ts`.
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
    expect(outcome.termination).toEqual({ reason: 'mission-complete', detail: 'nothing left' });
    expect(outcome.steps).toBe(5);
    expect(detail.status).toBe('complete');
    expect(detail.terminationReason).toBe('mission-complete');

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
      ['fill e1 searchbox "Search" with "software engineer"', 'ok'],
      ['click e2 button "Search"', 'ok'],
    ]);
    expect(brain.planInputs[2]?.ledger.openTask?.label).toBe('Senior Engineer at Acme');
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
    // One guidance document at taskDone, naming the field and the answer.
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
    expect(dumps.text('01-steps/05/teach.json')).toContain('fake-teach-1');
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
