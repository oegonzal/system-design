import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test, type TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BROWSER_STEP_PIPELINE_ID,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  FIELD_ANSWER_PIPELINE_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  MISSION_FIXTURE,
  type StepPlan,
} from '@sysdesign/contracts';
import {
  BrowserDecision,
  BrowserSession,
  BrowserTask,
  ensureDatabase,
  truncateTestTables,
} from '@sysdesign/db';
import { LoopClient } from '@sysdesign/loop-client';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { FORM_MEMORY_TARGET_STEP, LoopBrain } from '../../adapters/loop-http/loop-brain';
import type { SessionConfig } from '../../config';
import {
  FakeBrowser,
  JOURNEY_ANSWERS,
  JOURNEY_SEQUENCE,
  journeyPages,
  ScriptedOperator,
} from '../../core/testing';
import { AppModule } from '../app/app.module';
import { SessionService } from './session.service';
import { BRAIN, BROWSER, OPERATOR } from './tokens';

/**
 * The scripted end-to-end dry run: the module as it ships, with the browser
 * and the operator faked and the quality loop the shared fake — so what runs
 * is the real brain adapter over a loop that settles each run with a
 * scripted artifact, the real ledger in Postgres, the real dump on disk and
 * the real goal source. The fake loop's settle hook plays the orchestrator:
 * a form-memory orchestration gets a target run and a reported admission.
 */
describe('the session service, end to end', () => {
  let home: string;
  let moduleRef: TestingModule;
  let core: FakeLoop;
  let browser: FakeBrowser;
  let operator: ScriptedOperator;
  const plans: StepPlan[] = [...JOURNEY_SEQUENCE];

  const settle = (): void => {
    for (const run of core.runs.values()) {
      if (run.status !== 'running') continue;
      if (run.pipeline === BROWSER_STEP_PIPELINE_ID) {
        const plan = plans.shift();
        if (plan === undefined) throw new Error('the journey ran out of plans');
        core.complete(run.runId, [{ overall: 90, decision: 'accept', artifact: plan }]);
      }
    }
    for (const [id, orchestration] of core.orchestrations.records) {
      if (
        orchestration.status !== 'running' ||
        orchestration.orchestrator !== FORM_MEMORY_ORCHESTRATOR_ID
      )
        continue;
      const child = core.startRun({
        pipeline: FIELD_ANSWER_PIPELINE_ID,
        goal: orchestration.request.goal,
        criteria: core.startRequests[0]?.criteria,
        maxIterations: 1,
      });
      core.complete(child.runId, [{ overall: 90, decision: 'accept', artifact: JOURNEY_ANSWERS }]);
      core.orchestrations.complete(id, {
        [FORM_MEMORY_TARGET_STEP]: { runIds: [child.runId], report: { admission: 'admitted' } },
      });
    }
  };

  beforeAll(async () => {
    await ensureDatabase();
    home = mkdtempSync(join(tmpdir(), 'browser-session-e2e-'));
    writeFileSync(join(home, 'goal.md'), MISSION_FIXTURE);
    const config: SessionConfig = {
      loopUrl: 'http://unused.test',
      dumpDir: join(home, 'sessions'),
      profilesDir: join(home, 'profiles'),
      subject: 'Alex Example',
    };
    core = new FakeLoop({ now: () => new Date().toISOString() });
    const client = new FakeLoopClient(core);
    browser = new FakeBrowser(journeyPages());
    operator = new ScriptedOperator([{ kind: 'answer', text: 'Yes' }]);
    moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(LoopClient)
      .useValue(client)
      .overrideProvider(BRAIN)
      .useValue(new LoopBrain(client, { pollEveryMs: 0, sleep: async () => settle() }))
      .overrideProvider(BROWSER)
      .useValue(browser)
      .overrideProvider(OPERATOR)
      .useValue(operator)
      .compile();
    await moduleRef.init();
    await truncateTestTables(moduleRef.get(EntityManager), [
      BrowserSession,
      BrowserTask,
      BrowserDecision,
    ]);
  });

  afterAll(async () => {
    await truncateTestTables(moduleRef.get(EntityManager), [
      BrowserSession,
      BrowserTask,
      BrowserDecision,
    ]);
    await moduleRef.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('[BRW-1] drives the journey through the loop: the same rubric on every run, form-memory for the fields, one teach at taskDone, rows and dump to match', async () => {
    const service = moduleRef.get(SessionService);
    const outcome = await service.run({
      goalPath: join(home, 'goal.md'),
      profile: 'spec',
      headed: false,
      rails: { maxTasks: 3, maxMinutes: 30, maxConsecutiveFailures: 3, maxBrainFaults: 3 },
    });
    expect(outcome.status).toBe('complete');
    expect(outcome.termination.reason).toBe('mission-complete');
    expect(outcome.steps).toBe(5);
    expect(browser.opened).toEqual({ profile: 'spec', headed: false });
    expect(browser.closed).toBe(true);

    // The rubric was derived once per pipeline, and every start request carried it.
    expect(core.criteriaRequests.map((r) => r.pipeline)).toEqual([
      BROWSER_STEP_PIPELINE_ID,
      FIELD_ANSWER_PIPELINE_ID,
    ]);
    const rubric =
      core.criteriaRequests.length > 0
        ? core.deriveCriteria({ pipeline: BROWSER_STEP_PIPELINE_ID, goal: MISSION_FIXTURE })
            .criteria
        : [];
    const stepStarts = core.startRequests.filter((r) => r.pipeline === BROWSER_STEP_PIPELINE_ID);
    expect(stepStarts).toHaveLength(5);
    expect(
      stepStarts.every(
        (r) => r.maxIterations === 1 && JSON.stringify(r.criteria) === JSON.stringify(rubric),
      ),
    ).toBe(true);
    const orchestrations = core.orchestrations.startRequests;
    expect(orchestrations.map((o) => o.orchestrator)).toEqual([
      FORM_MEMORY_ORCHESTRATOR_ID,
      DOCUMENT_MEMORY_ORCHESTRATOR_ID,
    ]);
    expect(orchestrations[0]?.request.criteria).toEqual(rubric);
    expect(orchestrations[1]?.request.goal).toContain('Operator guidance');
    expect(orchestrations[1]?.request.goal).toContain('"Work authorisation"');

    // Rows: the session, one unit of work, nine decisions each naming its run.
    const detail = await service.show(outcome.sessionId);
    expect(detail).toMatchObject({
      status: 'complete',
      terminationReason: 'mission-complete',
      steps: 5,
    });
    expect(
      detail?.tasks.map((t) => [t.ordinal, t.status, t.outcome, t.startStep, t.endStep]),
    ).toEqual([[1, 'complete', 'done', 2, 4]]);
    expect(detail?.decisions).toHaveLength(9);
    // One step-plan row per step run, each naming a run the fake loop handed out.
    const planRuns = detail?.decisions
      .filter((d) => d.kind === 'step-plan')
      .map((d) => d.loopRunId);
    expect(planRuns).toHaveLength(stepStarts.length);
    expect(planRuns?.every((runId) => runId !== null && core.runs.has(runId))).toBe(true);
    const fields = detail?.decisions.filter((d) => d.kind === 'field-answer') ?? [];
    expect(fields.map((d) => [d.ref, d.source, d.answer])).toEqual([
      ['e1', 'memory', '6'],
      ['e2', 'operator', 'Yes'],
      ['e3', 'blank', null],
    ]);
    const formMemoryId = core.orchestrations.records.keys().next().value;
    expect(fields.every((d) => d.loopOrchestrationId === formMemoryId)).toBe(true);
    const teachId = [...core.orchestrations.records.keys()][1];
    expect(fields[1]?.teachOrchestrationId).toBe(teachId);
    expect(detail?.decisions.find((d) => d.kind === 'termination')).toMatchObject({
      source: 'loop',
      loopRunId: expect.stringMatching(/^fake-run-/),
    });
    expect(operator.prompts.map((p) => p.field.name)).toEqual(['Work authorisation']);

    // The dump on disk: step files as the steps happened, the closing files, one index row.
    const dumpDir = join(home, 'sessions', outcome.dumpRunId);
    expect(readdirSync(join(dumpDir, '01-steps')).sort()).toEqual(['01', '02', '03', '04', '05']);
    expect(readdirSync(join(dumpDir, '01-steps', '03')).sort()).toEqual([
      'fields.json',
      'observation.json',
      'plan.json',
      'screenshot.png',
      'snapshot.txt',
    ]);
    expect(existsSync(join(dumpDir, '01-steps', '04', 'teach.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dumpDir, 'manifest.json'), 'utf8'))).toMatchObject({
      kind: 'session',
      sessionId: outcome.sessionId,
      status: 'complete',
    });
    expect(
      readFileSync(join(home, 'sessions', 'index.jsonl'), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(1);

    const listed = await service.list(10);
    expect(listed.map((s) => s.id)).toEqual([outcome.sessionId]);
  });
});
