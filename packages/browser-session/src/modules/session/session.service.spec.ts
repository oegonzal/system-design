import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test, type TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BROWSER_SESSION_PIPELINES,
  BROWSER_STEP_PIPELINE_ID,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  FIELD_ANSWER_PIPELINE_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  MISSION_FIXTURE,
  SESSION_TOPICS,
  type StepPlan,
  FORM_MEMORY_TARGET_STEP,
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

import { LoopBrain } from '../../adapters/loop-http/loop-brain';
import { PACKAGE_ROOT, type SessionConfig } from '../../config';
import {
  FakeBrowser,
  JOURNEY_ANSWERS,
  JOURNEY_SEQUENCE,
  journeyPages,
  RecordingEvents,
  ScriptedOperator,
} from '../../core/testing';
import { FakeStopSignal } from '../../core/testing-session';
import { readSessionSettings } from '../../settings';
import { AppModule } from '../app/app.module';
import { SessionService } from './session.service';
import { BRAIN, BROWSER, OPERATOR, SESSION_EVENTS, STOP_SIGNAL } from './tokens';

/**
 * The scripted end-to-end dry run: the module as it ships, with the browser
 * and the operator faked, the bus a recorder and the quality loop the shared
 * fake — so what runs is the real brain adapter over a loop that settles each
 * run with a scripted artifact, the real ledger in Postgres, the real dump on
 * disk and the real goal source. The fake loop's settle hook plays the
 * orchestrator: a form-memory orchestration gets a target run and a reported
 * admission.
 */
describe('the session service, end to end', () => {
  let home: string;
  let moduleRef: TestingModule;
  let core: FakeLoop;
  let browser: FakeBrowser;
  let operator: ScriptedOperator;
  let events: RecordingEvents;
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
      notificationsUrl: 'http://unused.test',
      dumpDir: join(home, 'sessions'),
      profilesDir: join(home, 'profiles'),
      subject: 'Alex Example',
      advisors: [],
      // The settings this package ships, so the run below is the one a session gets.
      settings: readSessionSettings(PACKAGE_ROOT),
    };
    core = new FakeLoop({ now: () => new Date().toISOString() });
    const client = new FakeLoopClient(core);
    browser = new FakeBrowser(journeyPages());
    operator = new ScriptedOperator(['Yes']);
    events = new RecordingEvents();
    moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(LoopClient)
      .useValue(client)
      .overrideProvider(BRAIN)
      .useValue(new LoopBrain(client, { pollEveryMs: 0, sleep: async () => settle() }))
      .overrideProvider(BROWSER)
      .useValue(browser)
      .overrideProvider(OPERATOR)
      .useValue(operator)
      .overrideProvider(SESSION_EVENTS)
      .useValue(events)
      .overrideProvider(STOP_SIGNAL)
      .useValue(new FakeStopSignal())
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

  it('[BRW-1] [BRW-9] drives the journey through the loop: the same rubric on every run, form-memory for the fields, one teach the moment the operator answers, each entry imaged, rows and dump to match', async () => {
    const service = moduleRef.get(SessionService);
    const outcome = await service.run({
      goalPath: join(home, 'goal.md'),
      profile: 'spec',
      headed: false,
      rails: {
        targetDone: null,
        maxTasks: 3,
        maxMinutes: 30,
        maxConsecutiveFailures: 3,
        maxBrainFaults: 3,
        maxUnreadablePages: 3,
        maxStalledSteps: 3,
      },
    });
    expect(outcome.status).toBe('complete');
    expect(outcome.termination).toMatchObject({
      reason: 'mission-stop',
      cause: 'mission-complete',
    });
    expect(outcome.steps).toBe(5);
    expect(browser.opened).toEqual({ profile: 'spec', headed: false });
    expect(browser.closed).toBe(true);

    // The rubric was derived once for each pipeline the session runs, and every start request carried it.
    expect(core.criteriaRequests.map((r) => r.pipeline)).toEqual(
      Object.values(BROWSER_SESSION_PIPELINES),
    );
    const rubric =
      core.criteriaRequests.length > 0
        ? core.deriveCriteria({ pipeline: BROWSER_STEP_PIPELINE_ID, goal: MISSION_FIXTURE })
            .criteria
        : [];
    const stepStarts = core.startRequests.filter((r) => r.pipeline === BROWSER_STEP_PIPELINE_ID);
    expect(stepStarts).toHaveLength(5);
    expect(stepStarts.every((r) => JSON.stringify(r.criteria) === JSON.stringify(rubric))).toBe(
      true,
    );
    // One iteration on each page: the last plan is asked of the page the plan
    // before it already saw, but that plan ran its taskDone, so no revise.
    expect(stepStarts.map((r) => r.maxIterations)).toEqual([1, 1, 1, 1, 1]);
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
      terminationReason: 'mission-stop',
      terminationCause: 'mission-complete',
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
    expect(operator.questions.map((question) => question.prompt.title)).toEqual([
      'Work authorisation',
    ]);

    // The dump on disk: step files as the steps happened, the closing files, one index row.
    const dumpDir = join(home, 'sessions', outcome.dumpRunId);
    expect(readdirSync(join(dumpDir, '01-steps')).sort()).toEqual(['01', '02', '03', '04', '05']);
    // The answer was taught at the step it was given, not when the unit closed;
    // each entry on the form was imaged, outlined, under the shipped settings.
    expect(readdirSync(join(dumpDir, '01-steps', '03')).sort()).toEqual([
      'captures',
      'captures.json',
      'fields.json',
      'observation.json',
      'plan.json',
      'screenshot.png',
      'snapshot.txt',
      'teach.json',
    ]);
    const captures = JSON.parse(
      readFileSync(join(dumpDir, '01-steps', '03', 'captures.json'), 'utf8'),
    ) as { file: string; kind: string; label: string; outcome: string }[];
    expect(captures.map((c) => [c.file, c.kind, c.outcome])).toEqual([
      ['captures/01-fill-years-of-experience-with-python.png', 'fill', 'ok'],
      ['captures/02-select-work-authorisation.png', 'select', 'ok'],
    ]);
    // The value entered is in the list, never in a file name.
    expect(captures[1]?.label).toContain('"Yes"');
    expect(readdirSync(join(dumpDir, '01-steps', '03', 'captures')).sort()).toEqual(
      captures.map((c) => c.file.slice('captures/'.length)),
    );
    expect(browser.shots.filter((ref) => ref !== null)).toContain('e2');
    expect(existsSync(join(dumpDir, '01-steps', '04', 'teach.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dumpDir, 'manifest.json'), 'utf8'))).toMatchObject({
      kind: 'session',
      sessionId: outcome.sessionId,
      status: 'complete',
      settings: {
        capture: expect.stringMatching(/config\/capture\/field-entries\.json$/),
        session: expect.stringMatching(/config\/session\/standard\.json$/),
      },
    });
    // The operator was told which files were in force before the session began.
    expect(operator.notices[0]).toMatch(/^settings: capture .*field-entries\.json · session /);
    expect(
      readFileSync(join(home, 'sessions', 'index.jsonl'), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(1);

    const listed = await service.list(10);
    expect(listed.map((s) => s.id)).toEqual([outcome.sessionId]);

    // What the session said on the bus, through the wiring that ships: its start, the unit's open and close by the row's id, its end.
    expect(events.published.map((event) => event.topic)).toEqual([
      SESSION_TOPICS.started,
      SESSION_TOPICS.unitOpened,
      SESSION_TOPICS.unitClosed,
      SESSION_TOPICS.ended,
    ]);
    expect(events.published[1]?.payload).toMatchObject({
      sessionId: outcome.sessionId,
      subject: 'Alex Example',
      unit: { id: detail?.tasks[0]?.id, ordinal: 1 },
    });
    // The same events again from the rows, through the same bus.
    expect(await service.replayEvents(outcome.sessionId)).toBe(4);
    expect(events.published).toHaveLength(8);
    expect(await service.replayEvents(crypto.randomUUID())).toBeNull();
  });
});
