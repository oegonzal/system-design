import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EntityManager } from '@mikro-orm/postgresql';
import { Test, type TestingModule, type TestingModuleBuilder } from '@nestjs/testing';
import {
  answeringFixture,
  BROWSER_STEP_PIPELINE_ID,
  MISSION_FIXTURE,
  type SessionRailsDto,
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

import { NO_PROFILE_BUCKET, NO_TENANT, PACKAGE_ROOT, type SessionConfig } from '../../config';
import type { BrainPort } from '../../core/ports';
import {
  FakeBrowser,
  JOURNEY_SEQUENCE,
  journeyPages,
  RecordingEvents,
  ScriptedOperator,
} from '../../core/testing';
import { FakeStopSignal } from '../../core/testing-session';
import { readSessionSettings, type BrainSettings, type SessionSettings } from '../../settings';
import { AppModule } from '../app/app.module';
import { BRAIN, BROWSER, OPERATOR, SESSION_EVENTS, STOP_SIGNAL } from './tokens';

/**
 * The scripted end-to-end dry run, as both brains run it: the module as it
 * ships, with the browser and the operator faked, the bus a recorder and the
 * quality loop the shared fake — so what runs is a real brain adapter over a
 * loop that settles each run with a scripted artifact, the real ledger in
 * Postgres, the real dump on disk and the real goal source. The journey, its
 * configuration, its fakes and the boot are written once here; each spec adds
 * the brain under test and how the fake loop plays the part of what that
 * brain asks of it. No vitest import, so the Nest spec project can use it.
 */

/** The rails the journey runs under, as the command line would set them: wide enough for its five steps. */
export const JOURNEY_RAILS: SessionRailsDto = {
  targetDone: null,
  maxTasks: 3,
  maxMinutes: 30,
  unitGraceMinutes: 0,
  maxConsecutiveFailures: 3,
  maxBrainFaults: 3,
  maxUnreadablePages: 3,
  maxStalledSteps: 3,
};

export const JOURNEY_SUBJECT = 'Alex Example';

/** A home for one journey — the mission written as its goal, the dumps and profiles to land under it. */
export function journeyHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'browser-session-e2e-'));
  writeFileSync(join(home, 'goal.md'), MISSION_FIXTURE);
  return home;
}

/**
 * The settings the package ships, under the brain named: the package's own
 * files, read as they are, with the choices file alone answering another
 * brain — so a journey runs under either brain file the package ships — and,
 * for the memory brain, the one value the owner writes once the space's
 * strategy is judged: the run the space is made from.
 */
export function journeySettings(
  brain: BrainSettings['adapter'],
  judgedRun?: string,
): SessionSettings {
  const engine = join(PACKAGE_ROOT, 'config', 'engine.json');
  const memory = join(PACKAGE_ROOT, 'config', 'brain', 'memory.json');
  const shipped = JSON.parse(readFileSync(engine, 'utf8')) as Record<string, string>;
  return readSessionSettings(PACKAGE_ROOT, (at) => {
    if (at === engine) return JSON.stringify({ ...shipped, brain });
    if (at === memory && judgedRun !== undefined) {
      const file = JSON.parse(readFileSync(at, 'utf8')) as {
        binding: { space: { name: string } };
      };
      return JSON.stringify({
        ...file,
        binding: { ...file.binding, space: { ...file.binding.space, runId: judgedRun } },
      });
    }
    return readFileSync(at, 'utf8');
  });
}

/**
 * The configuration the journey boots the module with: nothing live reached,
 * the dumps under the home, and the settings given — asking on an inferred
 * value, so the journey's one guess reaches the operator and the teach path
 * runs end to end; the shipped table fills it. The tenant is the placeholder
 * unless the brain under test keeps its memories in a space.
 */
export function journeyConfig(
  home: string,
  settings: SessionSettings,
  memoryTenant: string = NO_TENANT,
): SessionConfig {
  return {
    loopUrl: 'http://unused.test',
    notificationsUrl: 'http://unused.test',
    memoryUrl: 'http://unused.test',
    memoryTenant,
    dumpDir: join(home, 'sessions'),
    profilesDir: join(home, 'profiles'),
    subject: JOURNEY_SUBJECT,
    advisors: [],
    channel: 'chrome',
    profileBucket: NO_PROFILE_BUCKET,
    docsDir: join(home, 'docs'),
    settings: { ...settings, answering: answeringFixture(['inferred']) },
  };
}

/** The fakes one journey runs over, and the plans it has left to hand out, in order. */
export interface JourneyFakes {
  core: FakeLoop;
  client: FakeLoopClient;
  browser: FakeBrowser;
  operator: ScriptedOperator;
  events: RecordingEvents;
  plans: StepPlan[];
}

export function journeyFakes(): JourneyFakes {
  // The fake's clock is the real one, so a run opened a moment ago has a fresh heartbeat.
  const core = new FakeLoop({ now: () => new Date().toISOString() });
  return {
    core,
    client: new FakeLoopClient(core),
    browser: new FakeBrowser(journeyPages()),
    operator: new ScriptedOperator(['Yes']),
    events: new RecordingEvents(),
    plans: [...JOURNEY_SEQUENCE],
  };
}

/** Every running `browser-step` run completed with the journey's next plan, accepted; a journey out of plans is a spec that ran too far. */
export function settlePlans(fakes: JourneyFakes): void {
  for (const run of fakes.core.runs.values()) {
    if (run.status !== 'running' || run.pipeline !== BROWSER_STEP_PIPELINE_ID) continue;
    const plan = fakes.plans.shift();
    if (plan === undefined) throw new Error('the journey ran out of plans');
    fakes.core.complete(run.runId, [{ overall: 90, decision: 'accept', artifact: plan }]);
  }
}

/** Every running run of the pipeline completed with the artifact, accepted: how a brain's own form run is judged by the fake. */
export function settleRuns(core: FakeLoop, pipeline: string, artifact: unknown): void {
  for (const run of core.runs.values()) {
    if (run.status !== 'running' || run.pipeline !== pipeline) continue;
    core.complete(run.runId, [{ overall: 90, decision: 'accept', artifact }]);
  }
}

/** The session's tables emptied — before a journey, and after it. */
export const emptyJourneyTables = (moduleRef: TestingModule): Promise<void> =>
  truncateTestTables(moduleRef.get(EntityManager), [BrowserSession, BrowserTask, BrowserDecision]);

/**
 * The module as it ships, booted over the journey's fakes: the loop client,
 * the browser, the operator, the events and the stop signal overridden by
 * token, the brain by the one given — composed over the same fake loop — or
 * the module's own when none is, and whatever else the spec overrides; the
 * session's tables emptied before the first row. The database is guarded
 * before anything connects.
 */
export async function bootJourney(
  config: SessionConfig,
  fakes: JourneyFakes,
  brain: BrainPort | null,
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestingModule> {
  await ensureDatabase();
  const composed = Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(LoopClient)
    .useValue(fakes.client);
  const builder = (brain === null ? composed : composed.overrideProvider(BRAIN).useValue(brain))
    .overrideProvider(BROWSER)
    .useValue(fakes.browser)
    .overrideProvider(OPERATOR)
    .useValue(fakes.operator)
    .overrideProvider(SESSION_EVENTS)
    .useValue(fakes.events)
    .overrideProvider(STOP_SIGNAL)
    .useValue(new FakeStopSignal());
  const moduleRef = await override(builder).compile();
  await moduleRef.init();
  await emptyJourneyTables(moduleRef);
  return moduleRef;
}
