import {
  bestIterationOf,
  BROWSER_STEP_PIPELINE_ID,
  composeStepGoal,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  emptyLedger,
  FIELD_ANSWER_PIPELINE_ID,
  FIELDS_HEADING,
  fieldSpecOf,
  FORM_MEMORY_ORCHESTRATOR_ID,
  formObservation,
  GoalBudgetExceeded,
  guidanceDocuments,
  listingObservation,
  MISSION_FIXTURE,
  NO_UNITS_ON_RECORD,
  readFieldIndex,
  renderDocumentGoal,
  routePlan,
  textBytes,
  type FieldAnswers,
  type OperatorGuidanceDto,
  type PageObservation,
  type StepPlan,
  stopsOf,
  stopsOnPage,
  takenOf,
  takenOnPage,
  FORM_MEMORY_TARGET_STEP,
} from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { BrainFaulted, type StepInput } from '../../core/ports';
import { fieldAnswer } from '../../core/testing';
import { LoopBrain } from './loop-brain';
import { guarded } from './loop-runs';
import { composeStepGoalWithinBudget, renderFieldProse } from './render-goal';

const PLAN: StepPlan = {
  assessment: 'a listing; open the first result',
  actions: [
    { kind: 'click', ref: 'e3', reason: 'first result', expect: 'the listing', serves: [] },
  ],
};

const ANSWERS: FieldAnswers = {
  summary: 'one field',
  fields: [fieldAnswer('e1', { value: '6', reason: 'cv' })],
};

const CRITERIA = [{ id: 'c1', kind: 'progress', statement: 'Open the next listing.' }];

/** The session and step every decision below is asked in. */
const SESSION = { sessionId: 'session-1', step: 6 };

/** One operator answer as the session records it, given in the unit of work `u-1`. */
const GUIDANCE: OperatorGuidanceDto = {
  sessionId: SESSION.sessionId,
  capturedAt: '2026-10-10T12:00:00.000Z',
  field: {
    question: 'Are you authorized to work in this country',
    type: 'radio',
    options: ['Yes', 'No'],
  },
  context: { taskLabel: 'Acme', unitKey: 'u-1', page: null },
  answer: 'Yes',
  about: 'subject',
  chosen: null,
  via: 'terminal',
};

const stepInput = (
  observation: PageObservation = listingObservation(),
  pageUnchanged = false,
  lastStep: StepInput['lastStep'] = null,
): StepInput => ({
  session: SESSION,
  mission: MISSION_FIXTURE,
  observation,
  history: [],
  ledger: emptyLedger(),
  objections: [],
  criteria: CRITERIA,
  pageUnchanged,
  lastStep,
  progress: { settled: [], done: [] },
  onRecord: NO_UNITS_ON_RECORD,
});

/** What the adapter reads from the page before fitting: the mission's stop words and the controls its exceptions are tied to. */
const withPageFacts = <I extends { mission: string; observation: PageObservation }>(input: I) => ({
  ...input,
  stops: stopsOnPage(stopsOf(input.mission), input.observation),
  taken: takenOnPage(takenOf(input.mission), input.observation),
});

/** The goal the brain composes from a step input: the rubric rides in as the progress section's. */
const goalInputOf = (observation: PageObservation) => ({
  ...stepInput(observation),
  progress: { criteria: CRITERIA, settled: [], done: [] },
});

/** A brain over the fake loop whose every poll settles what is running, by the script given. */
function harness(settle: (core: FakeLoop) => void) {
  // The fake's clock is the real one, so a run opened a moment ago has a fresh heartbeat.
  const core = new FakeLoop({ now: () => new Date().toISOString() });
  const client = new FakeLoopClient(core);
  const brain = new LoopBrain(client, { pollEveryMs: 0, sleep: async () => settle(core) });
  return { core, client, brain };
}

const completeRuns = (artifact: unknown) => (core: FakeLoop) => {
  for (const run of core.runs.values()) {
    if (run.status === 'running') core.complete(run.runId, [{ overall: 90, artifact }]);
  }
};

/** The orchestrator's target step as the fake settles it: a child run completed, the admission reported. */
const completeFormMemory =
  (
    artifact: unknown,
    report: Record<string, unknown> | null = { admission: 'admitted', withheld: [] },
  ) =>
  (core: FakeLoop) => {
    for (const [id, orchestration] of core.orchestrations.records) {
      if (orchestration.status !== 'running') continue;
      const child = core.startRun({
        pipeline: FIELD_ANSWER_PIPELINE_ID,
        goal: orchestration.request.goal,
        criteria: CRITERIA,
        maxIterations: 1,
      });
      core.complete(child.runId, [{ overall: 90, artifact }]);
      core.orchestrations.complete(id, {
        recall: { counts: { probes: 1, candidates: 0, evidence: 0 } },
        [FORM_MEMORY_TARGET_STEP]: { runIds: [child.runId], report },
      });
    }
  };

describe('the loop brain', () => {
  it('[BRW-1] derives the rubric through the loop and plans a step as one browser-step run with the rubric supplied', async () => {
    const { core, brain } = harness(completeRuns(PLAN));
    const {
      pipeline,
      criteria: rubric,
      dumpRunId,
    } = await brain.deriveRubric('plan', MISSION_FIXTURE);
    // A session asks by role; the brain knows which pipeline plays it.
    expect(pipeline).toBe(BROWSER_STEP_PIPELINE_ID);
    expect(rubric.length).toBeGreaterThan(0);
    // The loop names the dump of its derivation; this fake loop writes none.
    expect(dumpRunId).toBeNull();
    expect(core.criteriaRequests[0]).toEqual({
      pipeline: BROWSER_STEP_PIPELINE_ID,
      goal: MISSION_FIXTURE,
    });

    const decided = await brain.planStep(stepInput());
    expect(core.startRequests).toHaveLength(1);
    expect(core.startRequests[0]).toMatchObject({
      pipeline: BROWSER_STEP_PIPELINE_ID,
      criteria: CRITERIA,
      maxIterations: 1,
      // Who opened the run, for the loop's lists: the session, and the step it was.
      openedBy: { kind: 'browser-session', id: 'session-1', label: 'step 6' },
    });
    expect(core.startRequests[0]?.goal).toContain('## Index');
    expect(core.startRequests[0]?.goal).toContain(MISSION_FIXTURE.trim());
    expect(decided.runId).toBe('fake-run-1');
    expect(decided.orchestrationRunId).toBeNull();
    // On a page unchanged since a plan that ran nothing, the loop is asked to revise once in-run;
    // after a plan that ran something, a fresh plan is briefed by what ran.
    await brain.planStep(stepInput(listingObservation(), true, { ran: 0, touched: [], held: [] }));
    expect(core.startRequests[1]?.maxIterations).toBe(2);
    await brain.planStep(stepInput(listingObservation(), true, { ran: 1, touched: [], held: [] }));
    expect(core.startRequests[2]?.maxIterations).toBe(1);
    expect(core.startRequests[2]?.goal).toContain('this page did not change');
    // A criterion the session settled leaves the rubric this run is judged against and enters the goal.
    await brain.planStep({ ...stepInput(), progress: { settled: ['c1'], done: [] } });
    expect(core.startRequests[3]?.criteria).toEqual([]);
    expect(core.startRequests[3]?.goal).toContain('- c1 — Open the next listing.');
    expect(routePlan(decided.run, 1).plan).toEqual(PLAN);
    expect(decided.run.status).toBe('complete');
    expect(decided.composition).toEqual({
      rung: 'full',
      bytes: textBytes(core.startRequests[0]?.goal ?? ''),
      snapshotRung: 'full',
    });
  });

  it('[BRW-3] [QL-71] answers fields through the form-memory orchestration — the goal’s index naming the open unit of work — reading the target run and the admission the server reports, its recall the loop’s own', async () => {
    const fields = formObservation().elements.slice(0, 2).map(fieldSpecOf);
    const input = {
      session: SESSION,
      mission: MISSION_FIXTURE,
      task: { label: 'Acme', url: 'https://x.test/1', facets: [], unitKey: 'u-1', context: null },
      fields,
      criteria: CRITERIA,
    };
    const admitted = harness(completeFormMemory(ANSWERS));
    const decided = await admitted.brain.answerFields(input);
    const started = admitted.core.orchestrations.startRequests[0];
    expect(readFieldIndex(started?.request.goal ?? '')?.unitKey).toBe('u-1');
    expect(started?.orchestrator).toBe(FORM_MEMORY_ORCHESTRATOR_ID);
    expect(started?.request).toMatchObject({
      criteria: CRITERIA,
      maxIterations: 1,
      openedBy: { kind: 'browser-session', id: 'session-1', label: 'step 6 · form page' },
    });
    expect(started?.request.goal).toContain(FIELDS_HEADING);
    expect(started?.request.goal).toContain('- e1 · textbox "Years of experience with Python"');
    expect(started?.request.goal).toContain(renderFieldProse(input));
    expect(decided.admission).toBe('admitted');
    // The recall is the orchestration's own step, on its record: the brain reports none.
    expect(decided.recall).toBeNull();
    expect(decided.orchestrationRunId).toBe('fake-run-orchestration-1');
    expect(decided.runId).toBe('fake-run-1');
    expect(bestIterationOf(decided.run)?.artifact).toEqual(ANSWERS);

    const unreported = harness(completeFormMemory(ANSWERS, null));
    expect((await unreported.brain.answerFields(input)).admission).toBe('fell-short');
    const fellShort = harness(
      completeFormMemory(ANSWERS, { admission: 'fell-short', withheld: [] }),
    );
    expect((await fellShort.brain.answerFields(input)).admission).toBe('fell-short');
    // A report the declared shape does not read is no admission, and withholds nothing.
    const drifted = harness(completeFormMemory(ANSWERS, { admission: 'maybe', withheld: 'e2' }));
    const read = await drifted.brain.answerFields(input);
    expect([read.admission, read.withheld]).toEqual(['fell-short', []]);

    const noTarget = harness((core) => {
      for (const [id, o] of core.orchestrations.records) {
        if (o.status === 'running')
          core.orchestrations.complete(id, {
            recall: { status: 'skipped', reason: 'store-empty' },
          });
      }
    });
    await expect(noTarget.brain.answerFields(input)).rejects.toMatchObject({
      reason: 'no-artifact',
    });
    const failed = harness((core) => {
      for (const [id, o] of core.orchestrations.records)
        if (o.status === 'running') core.orchestrations.fail(id, 'boom');
    });
    await expect(failed.brain.answerFields(input)).rejects.toMatchObject({ reason: 'failed' });
  });

  it('teaches answers as the guidance documents they make, each a document-memory orchestration it does not wait for, each answer’s receipt naming its document queued', async () => {
    const { core, brain } = harness(() => undefined);
    const receipts = await brain.teach([GUIDANCE], SESSION, 'Alex Example');
    expect(receipts).toEqual([{ ref: 'fake-run-orchestration-1', outcome: 'queued', fault: null }]);
    const [made] = guidanceDocuments(SESSION.sessionId, 'Alex Example', [GUIDANCE], (one) => one);
    if (made === undefined) throw new Error('one answer makes one document');
    expect(core.orchestrations.startRequests[0]).toEqual({
      orchestrator: DOCUMENT_MEMORY_ORCHESTRATOR_ID,
      request: {
        goal: renderDocumentGoal(made.document),
        maxIterations: 2,
        openedBy: { kind: 'browser-session', id: 'session-1', label: 'step 6 · teaching' },
      },
    });
    expect(core.orchestrations.get('fake-run-orchestration-1')?.status).toBe('running');
    // Answers given in two units of work are two documents, two orchestrations: each answer's receipt names its own, never both.
    const elsewhere = { ...GUIDANCE, context: { ...GUIDANCE.context, unitKey: 'u-2' } };
    expect(await brain.teach([GUIDANCE, elsewhere], SESSION, 'Alex Example')).toEqual([
      { ref: 'fake-run-orchestration-2', outcome: 'queued', fault: null },
      { ref: 'fake-run-orchestration-3', outcome: 'queued', fault: null },
    ]);
  });

  it('turns every client error into a brain fault with its reason, and leaves other errors alone', async () => {
    const down = harness(() => undefined);
    down.core.unreachable = true;
    await expect(down.brain.deriveRubric('plan', 'x')).rejects.toMatchObject({
      reason: 'unreachable',
    });
    const refusing = harness(() => undefined);
    refusing.core.failNextStart = new LoopRefused(400, 'bad goal');
    await expect(refusing.brain.planStep(stepInput())).rejects.toMatchObject({
      reason: 'failed',
      message: 'brain failed: bad goal',
    });
    const noModel = harness(() => undefined);
    noModel.core.derivationFails = true;
    await expect(noModel.brain.deriveRubric('plan', 'x')).rejects.toMatchObject({
      reason: 'failed',
    });
    const failing = harness((core) => {
      for (const run of core.runs.values())
        if (run.status === 'running') core.fail(run.runId, 'the model refused');
    });
    await expect(failing.brain.planStep(stepInput())).rejects.toMatchObject({
      reason: 'failed',
      message: 'brain failed: the model refused',
    });
    const lost = harness((core) => {
      for (const run of [...core.runs.values()])
        if (run.status === 'running') core.forget(run.runId);
    });
    await expect(lost.brain.planStep(stepInput())).rejects.toMatchObject({ reason: 'lost' });
    // The guard reads the table: a goal past the budget is the brain's fault, a bug is left as it is, a fault stays itself.
    await expect(
      guarded(() => Promise.reject(new GoalBudgetExceeded(70_000, 64_000))),
    ).rejects.toMatchObject({ reason: 'goal-budget' });
    await expect(guarded(() => Promise.reject(new TypeError('a bug')))).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(
      guarded(() => Promise.reject(new BrainFaulted('no-artifact', 'x'))),
    ).rejects.toMatchObject({ reason: 'no-artifact' });
  });

  it('[BRW-2] fits an oversized page to the budget by declared rungs — snapshot, context, elements — and refuses rather than clip', async () => {
    const base = listingObservation();
    const big: PageObservation = {
      ...base,
      ariaSnapshot: '- text: lorem ipsum\n'.repeat(400),
      elements: base.elements.map((element) => ({
        ...element,
        context: 'x'.repeat(280),
        value: 'v'.repeat(400),
      })),
    };
    const input = goalInputOf(big);
    const fullBytes = textBytes(composeStepGoal(withPageFacts(input)));
    expect(composeStepGoalWithinBudget(input, fullBytes)).toMatchObject({
      rung: 'full',
      omittedElements: 0,
    });

    // A snapshot too large to carry whole is reduced into the room the rest of
    // the goal leaves, not discarded to save room nothing needed. Measured
    // live: a 1,415-line form page arrived as `reduced to none` inside a 35KB
    // goal of a 64KB budget, and the validation message that would have said
    // why the form was stuck went with it.
    // A page's real shape: node lines carrying refs, each with a property line
    // under it — so the rungs have something to drop and the snapshot reduces
    // rather than vanishing.
    const lines = Array.from({ length: 380 }, (_, i) => [
      `  - link "result ${i}" [ref=e${i + 1}] [cursor=pointer]:`,
      `    - /url: https://example.test/${'p'.repeat(60)}/${i}`,
    ]).flat();
    const huge = goalInputOf({
      ...big,
      ariaSnapshot: ['- generic [ref=e1]:', ...lines].join('\n'),
    });
    const bare = textBytes(
      composeStepGoal(withPageFacts({ ...huge, observation: { ...big, ariaSnapshot: '' } })),
    );
    const roomy = composeStepGoalWithinBudget(huge, bare + 20_000);
    expect(roomy.rung).toBe('full');
    expect(roomy.goal).toContain('[ref=e1]');
    expect(textBytes(roomy.goal)).toBeLessThanOrEqual(bare + 20_000);
    // And it used the room: far more snapshot than the old fixed cut left.
    expect(textBytes(roomy.goal) - bare).toBeGreaterThan(10_000);

    const noSnapshot = composeStepGoal(
      withPageFacts({ ...input, observation: { ...big, ariaSnapshot: '' } }),
    );
    const withoutSnapshot = composeStepGoalWithinBudget(input, textBytes(noSnapshot));
    expect(withoutSnapshot.rung).toBe('without-snapshot');
    expect(withoutSnapshot.goal).not.toContain('lorem ipsum');
    expect(withoutSnapshot.goal).toContain('x'.repeat(280));

    const trimmed = composeStepGoalWithinBudget(input, textBytes(noSnapshot) - 1);
    expect(trimmed.rung).toBe('trimmed-context');
    expect(trimmed.goal).not.toContain('x'.repeat(280));
    expect(trimmed.goal).toContain(`${'v'.repeat(60)}…`);
    expect(trimmed.omittedElements).toBe(0);

    const fewer = composeStepGoalWithinBudget(input, trimmed.bytes - 1);
    expect(fewer.rung).toBe('fewer-elements');
    expect(fewer.omittedElements).toBeGreaterThan(0);
    expect(fewer.goal).toContain(`(${fewer.omittedElements} more interactive elements not listed)`);
    expect(fewer.bytes).toBeLessThan(trimmed.bytes);

    // Whether a stop's words are shown is read from the page as the browser read it: a
    // goal with no room for its snapshot still says the page shows them, so a correct
    // terminate is never cut for words a reduced snapshot dropped.
    const stopShown = goalInputOf({
      ...big,
      ariaSnapshot: `${big.ariaSnapshot}\n- text: no more applications today`,
    });
    // Room for everything but the snapshot, the stop line saying what the page as read shows.
    const stopFree = textBytes(
      composeStepGoal({ ...withPageFacts(stopShown), observation: { ...big, ariaSnapshot: '' } }),
    );
    const reduced = composeStepGoalWithinBudget(stopShown, stopFree);
    expect(reduced.rung).toBe('without-snapshot');
    expect(reduced.goal).not.toContain('no more applications today');
    expect(reduced.goal).toContain('This page shows "no more applications"');

    expect(() => composeStepGoalWithinBudget(input, 100)).toThrow(GoalBudgetExceeded);
    const { brain } = harness(() => undefined);
    await expect(
      brain.planStep({ ...stepInput(), mission: 'm'.repeat(70_000) }),
    ).rejects.toMatchObject({ reason: 'goal-budget' });
  });

  it('[BRW-2] keeps an open dialog whole when the goal cuts the snapshot, modal or not', () => {
    // Measured 2026-10-10: the dialog confirming an application was sent
    // carried no aria-modal and sat last in the snapshot; the goal's cut
    // dropped its heading, and the judges read the outcome from the pane alone.
    const base = listingObservation();
    const [first] = base.elements;
    if (first === undefined) throw new Error('the listing fixture lists no element');
    const page = Array.from({ length: 380 }, (_, i) => [
      `  - link "result ${i}" [ref=e${i + 1}] [cursor=pointer]:`,
      `    - /url: https://example.test/${'p'.repeat(60)}/${i}`,
    ]).flat();
    const observation: PageObservation = {
      ...base,
      elements: [
        ...base.elements,
        {
          ...first,
          ref: 'e9001',
          role: 'button',
          name: 'Not now',
          scope: { role: 'dialog', name: '', modal: false },
        },
      ],
      ariaSnapshot: [
        '- generic [ref=e1]:',
        ...page,
        '- dialog:',
        '  - button "Not now" [ref=e9001]',
        '  - heading "Your application was sent to Acme!" [level=3]',
      ].join('\n'),
    };
    const input = goalInputOf(observation);
    const bare = textBytes(
      composeStepGoal(
        withPageFacts({ ...input, observation: { ...observation, ariaSnapshot: '' } }),
      ),
    );
    const fitted = composeStepGoalWithinBudget(input, bare + 4_000);
    expect(fitted.goal).toContain('reduced to scope');
    expect(fitted.goal).toContain('Your application was sent to Acme!');
  });
});
