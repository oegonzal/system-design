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
  listingObservation,
  MISSION_FIXTURE,
  renderDocumentGoal,
  resumeChunk,
  routePlan,
  textBytes,
  type FieldAnswers,
  type PageObservation,
  type StepPlan,
} from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { BrainFaulted, type StepInput } from '../../core/ports';
import { FORM_MEMORY_TARGET_STEP, LoopBrain, toBrainFault } from './loop-brain';
import { composeStepGoalWithinBudget, renderFieldProse } from './render-goal';

const PLAN: StepPlan = {
  pageKind: 'listing',
  assessment: 'a listing; open the first result',
  actions: [{ kind: 'click', ref: 'e3', reason: 'first result', expect: 'the listing' }],
};

const ANSWERS: FieldAnswers = {
  summary: 'one field',
  fields: [
    { ref: 'e1', decision: 'answer', value: '6', confidence: 'high', basis: [], reason: 'cv' },
  ],
};

const CRITERIA = [{ id: 'c1', kind: 'progress', statement: 'Open the next listing.' }];

const stepInput = (observation: PageObservation = listingObservation()): StepInput => ({
  mission: MISSION_FIXTURE,
  observation,
  history: [],
  ledger: emptyLedger(),
  objections: [],
  criteria: CRITERIA,
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
  (artifact: unknown, report: Record<string, unknown> | null = { admission: 'admitted' }) =>
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
    const rubric = await brain.deriveRubric(BROWSER_STEP_PIPELINE_ID, MISSION_FIXTURE);
    expect(rubric.length).toBeGreaterThan(0);
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
    });
    expect(core.startRequests[0]?.goal).toContain('## Index');
    expect(core.startRequests[0]?.goal).toContain(MISSION_FIXTURE.trim());
    expect(decided.runId).toBe('fake-run-1');
    expect(decided.orchestrationRunId).toBeNull();
    expect(routePlan(decided.run, 1).plan).toEqual(PLAN);
    expect(decided.run.status).toBe('complete');
    expect(decided.composition).toEqual({
      rung: 'full',
      bytes: textBytes(core.startRequests[0]?.goal ?? ''),
    });
  });

  it('[BRW-3] answers fields through the form-memory orchestration, reading the target run and the admission the server reports', async () => {
    const fields = formObservation().elements.slice(0, 2).map(fieldSpecOf);
    const input = {
      mission: MISSION_FIXTURE,
      task: { label: 'Acme', url: 'https://x.test/1' },
      fields,
      criteria: CRITERIA,
    };
    const admitted = harness(completeFormMemory(ANSWERS));
    const decided = await admitted.brain.answerFields(input);
    const started = admitted.core.orchestrations.startRequests[0];
    expect(started?.orchestrator).toBe(FORM_MEMORY_ORCHESTRATOR_ID);
    expect(started?.request).toMatchObject({ criteria: CRITERIA, maxIterations: 1 });
    expect(started?.request.goal).toContain(FIELDS_HEADING);
    expect(started?.request.goal).toContain('- e1 · textbox "Years of experience with Python"');
    expect(started?.request.goal).toContain(renderFieldProse(input));
    expect(decided.admission).toBe('admitted');
    expect(decided.orchestrationRunId).toBe('fake-run-orchestration-1');
    expect(decided.runId).toBe('fake-run-1');
    expect(bestIterationOf(decided.run)?.artifact).toEqual(ANSWERS);

    const unreported = harness(completeFormMemory(ANSWERS, null));
    expect((await unreported.brain.answerFields(input)).admission).toBe('fell-short');
    const fellShort = harness(completeFormMemory(ANSWERS, { admission: 'fell-short' }));
    expect((await fellShort.brain.answerFields(input)).admission).toBe('fell-short');

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

  it('teaches a document as a document-memory orchestration and does not wait for it', async () => {
    const { core, brain } = harness(() => undefined);
    const { orchestrationRunId } = await brain.teach(resumeChunk());
    expect(orchestrationRunId).toBe('fake-run-orchestration-1');
    expect(core.orchestrations.startRequests[0]).toEqual({
      orchestrator: DOCUMENT_MEMORY_ORCHESTRATOR_ID,
      request: { goal: renderDocumentGoal(resumeChunk()), maxIterations: 2 },
    });
    expect(core.orchestrations.get(orchestrationRunId)?.status).toBe('running');
  });

  it('turns every client error into a brain fault with its reason, and leaves other errors alone', async () => {
    const down = harness(() => undefined);
    down.core.unreachable = true;
    await expect(down.brain.deriveRubric(BROWSER_STEP_PIPELINE_ID, 'x')).rejects.toMatchObject({
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
    await expect(noModel.brain.deriveRubric(BROWSER_STEP_PIPELINE_ID, 'x')).rejects.toMatchObject({
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
    expect(toBrainFault(new GoalBudgetExceeded(70_000, 64_000))?.reason).toBe('goal-budget');
    expect(toBrainFault(new TypeError('a bug'))).toBeNull();
    expect(toBrainFault(new BrainFaulted('no-artifact', 'x'))?.reason).toBe('no-artifact');
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
    const input = stepInput(big);
    const fullBytes = textBytes(composeStepGoal(input));
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
    const huge = stepInput({ ...big, ariaSnapshot: ['- generic [ref=e1]:', ...lines].join('\n') });
    const bare = textBytes(composeStepGoal({ ...huge, observation: { ...big, ariaSnapshot: '' } }));
    const roomy = composeStepGoalWithinBudget(huge, bare + 20_000);
    expect(roomy.rung).toBe('full');
    expect(roomy.goal).toContain('[ref=e1]');
    expect(textBytes(roomy.goal)).toBeLessThanOrEqual(bare + 20_000);
    // And it used the room: far more snapshot than the old fixed cut left.
    expect(textBytes(roomy.goal) - bare).toBeGreaterThan(10_000);

    const noSnapshot = composeStepGoal({ ...input, observation: { ...big, ariaSnapshot: '' } });
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

    expect(() => composeStepGoalWithinBudget(input, 100)).toThrow(GoalBudgetExceeded);
    const { brain } = harness(() => undefined);
    await expect(
      brain.planStep({ ...stepInput(), mission: 'm'.repeat(70_000) }),
    ).rejects.toMatchObject({ reason: 'goal-budget' });
  });
});
