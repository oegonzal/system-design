import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { TestingModule } from '@nestjs/testing';
import { MemoryClient, type BoundSpace } from '@sysdesign/agentic-memory-client';
import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';
import {
  BROWSER_STEP_PIPELINE_ID,
  FIELD_ANSWER_PIPELINE_ID,
  FIELD_EVIDENCE_HEADING,
  kindsLegend,
  readEvidenceItems,
  readFieldIndex,
  unitKeyOf,
  type OperatorGuidanceDto,
  type WriteResultDto,
} from '@sysdesign/contracts';

import { bindBrainSpace } from '../../adapters/memory-loop/binding';
import { MemoryLoopBrain } from '../../adapters/memory-loop/memory-loop-brain';
import { predicateOf } from '../../adapters/memory-loop/teach';
import {
  assistantStrategy,
  spiedClient,
  unitValue,
  type MemoryHostSpy,
} from '../../adapters/memory-loop/testing';
import { JOURNEY_ANSWERS } from '../../core/testing';
import type { MemoryBrainSettings } from '../../settings';
import {
  bootJourney,
  emptyJourneyTables,
  JOURNEY_RAILS,
  JOURNEY_SUBJECT,
  journeyConfig,
  journeyFakes,
  journeyHome,
  journeySettings,
  settlePlans,
  settleRuns,
  type JourneyFakes,
} from './session-journey.testing';
import { SessionService } from './session.service';

/**
 * The same scripted end-to-end dry run under the brain file the package
 * ships for a memory space (`config/brain/memory.json`): the space is the
 * runtime in process, made from a strategy of the four registers the binding
 * names, and the fake loop judges the one form run the brain opens on the
 * goal the session composed with the evidence. What the loop journey proves
 * of rows, dump and events holds here but for where the memory is: the fields
 * are recalled for in the space under the open unit of work, the operator's
 * answer is written to it as a fact, and the recorded dump is taught again
 * and replayed against it through the module as it ships.
 */
describe('the session service, end to end, under the memory brain', () => {
  const TENANT = 'verify-e2e';
  const JUDGED_RUN = 'run-judged-e2e';
  let home: string;
  let moduleRef: TestingModule;
  let fakes: JourneyFakes;
  let brain: MemoryBrainSettings;
  let bound: BoundSpace;
  let spy: MemoryHostSpy;
  let rows: () => { id: string; register: string; version: number }[];
  let fact: WriteResultDto;
  const warnings: string[] = [];

  const settle = (): void => {
    settlePlans(fakes);
    settleRuns(fakes.core, FIELD_ANSWER_PIPELINE_ID, JOURNEY_ANSWERS);
  };

  beforeAll(async () => {
    home = journeyHome();
    fakes = journeyFakes();
    // The shipped file, with the one value the owner writes once the strategy is judged: the run the space is made from.
    const settings = journeySettings('memory', JUDGED_RUN);
    if (settings.brain.adapter !== 'memory')
      throw new Error('the memory file names the memory adapter');
    brain = settings.brain;
    // The space: the runtime in process, ensured from the run the binding names, made of the four registers.
    const { client: inner, records } = memoryClientUnderTest({
      strategies: { [JUDGED_RUN]: assistantStrategy() },
    });
    const spied = spiedClient(inner);
    spy = spied.spy;
    rows = () => records.all();
    bound = await bindBrainSpace(spied.client, brain);
    // A fact of the subject, as an ingest into the space would have written it: of the tenant, under the project.
    fact = await spied.client.remember(bound.spaceId, {
      register: 'profile_fact',
      scope: { tenant: TENANT, project: brain.project },
      candidate: {
        subject: JOURNEY_SUBJECT,
        predicate: 'python_years',
        value: '6 years of Python',
        validFrom: null,
      },
      provenance: { source: 'memory-ingest:resume', sourceRunId: null },
    });
    moduleRef = await bootJourney(
      journeyConfig(home, settings, TENANT),
      fakes,
      // Bound by the run, as the module's own brain is: the first row waits on the binding.
      new MemoryLoopBrain(fakes.client, spied.client, brain, TENANT, {
        pollEveryMs: 0,
        sleep: async () => settle(),
        warn: (text) => warnings.push(text),
      }),
      // The client the module would make for the host, replaced by the one over the runtime in process.
      (builder) => builder.overrideProvider(MemoryClient).useValue(spied.client),
    );
  });

  afterAll(async () => {
    await emptyJourneyTables(moduleRef);
    await moduleRef.close();
    rmSync(home, { recursive: true, force: true });
  });

  it("[BRW-1] [BRW-9] [BRW-21] [BRW-23] drives the journey through the space: the fields recalled for under the open unit and judged once by the loop with the evidence, the operator's answer written as a fact whose receipt lands on its row, the same rows and dump as under the loop but for where the memory is", async () => {
    const { core, operator } = fakes;
    const service = moduleRef.get(SessionService);
    const outcome = await service.run({
      goalPath: join(home, 'goal.md'),
      profile: 'spec',
      headed: false,
      rails: JOURNEY_RAILS,
    });
    expect(outcome.status).toBe('complete');
    expect(outcome.termination).toMatchObject({
      reason: 'mission-stop',
      cause: 'mission-complete',
    });
    expect(outcome.steps).toBe(5);
    expect(warnings).toEqual([]);

    // Plans through the loop as under the loop brain; the form as one field-answer run, no orchestration between.
    expect(core.startRequests.filter((r) => r.pipeline === BROWSER_STEP_PIPELINE_ID)).toHaveLength(
      5,
    );
    const formStarts = core.startRequests.filter((r) => r.pipeline === FIELD_ANSWER_PIPELINE_ID);
    expect(formStarts).toHaveLength(1);
    expect(core.orchestrations.startRequests).toEqual([]);
    const detail = await service.show(outcome.sessionId);
    const unit = detail?.tasks[0];
    if (unit === undefined) throw new Error('the journey opens one unit of work');
    const unitKey = unitKeyOf({ id: unit.id, facets: unit.facets });

    // One recall per distinct question the page asks, by text alone, under the
    // tenant, the project and the open unit hashed — over the registers the
    // roles name, read through the bound space, never the roles themselves.
    const registers = brain.facts.map((role) => brain.binding.registers[role]?.name);
    expect(spy.recalls).toHaveLength(3);
    for (const request of spy.recalls) {
      expect(Object.keys(request).sort()).toEqual(['registers', 'scope', 'text']);
      expect(request).toMatchObject({
        scope: { tenant: TENANT, project: brain.project, unit: unitValue(unitKey) },
        registers,
      });
    }
    expect(spy.recalls.map((request) => request.text)).toContain(
      'Years of experience with Python. Whole years, professional only.',
    );

    // The goal the loop judged: the unit named, the legend the settings declare,
    // the fact as evidence with its kind, scope, day and record — and the run
    // opened for one iteration by the session at its step.
    const started = formStarts[0];
    expect(started).toMatchObject({
      maxIterations: 1,
      openedBy: { kind: 'browser-session', id: outcome.sessionId, label: 'step 3 · form page' },
    });
    const goal = started?.goal ?? '';
    expect(readFieldIndex(goal)?.unitKey).toBe(unitKey);
    expect(goal).toContain(FIELD_EVIDENCE_HEADING);
    expect(goal).toContain(kindsLegend(brain.legend));
    expect(readEvidenceItems(goal)).toEqual([
      {
        alias: 'm1',
        kind: 'profile_fact',
        scope: 'subject',
        text: `${JOURNEY_SUBJECT} — python_years: 6 years of Python`,
        when: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        source: { origin: 'memory-ingest:resume', ref: `${fact.record.id}@v1` },
      },
    ]);

    // Rows: the same routes and values as under the loop; every field row names
    // the one run and no orchestration; the answered row carries the receipt.
    expect(detail).toMatchObject({ status: 'complete', steps: 5 });
    expect(detail?.decisions).toHaveLength(9);
    const fields = detail?.decisions.filter((d) => d.kind === 'field-answer') ?? [];
    expect(fields.map((d) => [d.ref, d.source, d.answer])).toEqual([
      ['e1', 'memory', '6'],
      ['e2', 'operator', 'Yes'],
      ['e3', 'blank', null],
    ]);
    const formRunId = [...core.runs.values()].find(
      (run) => run.pipeline === FIELD_ANSWER_PIPELINE_ID,
    )?.runId;
    expect(fields.every((d) => d.loopRunId === formRunId && d.loopOrchestrationId === null)).toBe(
      true,
    );
    const taught = rows().filter((row) => row.register === 'standing_answer');
    expect(taught).toHaveLength(1);
    const answer = taught[0];
    expect(fields[1]?.teachingRef).toBe(answer?.id);
    expect(fields[1]?.payload['teaching']).toEqual({ ref: answer?.id, outcome: 'inserted' });
    expect(fields.filter((d) => d.ref !== 'e2').map((d) => d.teachingRef)).toEqual([null, null]);
    expect(operator.questions.map((question) => question.prompt.title)).toEqual([
      'Work authorisation',
    ]);

    // The fact the answer became: deterministic — the question hashed as its
    // predicate, the question, the options and the answer in its words — of
    // the subject as the answerer declared, given at the step's instant, with
    // the channel as provenance and the declared metadata filled.
    const dumpDir = join(home, 'sessions', outcome.dumpRunId);
    const stepDir = join(dumpDir, '01-steps', '03');
    const fieldsFile = JSON.parse(readFileSync(join(stepDir, 'fields.json'), 'utf8')) as {
      recall: unknown;
      fields: { result: { guidance: OperatorGuidanceDto | null } | null }[];
    };
    const guidance = fieldsFile.fields
      .map((field) => field.result?.guidance ?? null)
      .find((item) => item !== null);
    if (guidance == null) throw new Error('the step taught one answer');
    expect(guidance.about).toBe('subject');
    expect(answer).toMatchObject({
      version: 1,
      scope: { tenant: TENANT, project: brain.project },
      body: {
        subject: JOURNEY_SUBJECT,
        predicate: predicateOf(guidance.field.question),
        validFrom: guidance.capturedAt,
      },
      text: expect.stringContaining(
        `Asked "Work authorisation. Are you authorised to work in this country?", offering Yes | No, ${JOURNEY_SUBJECT} answered "Yes".`,
      ),
      metadata: { question: guidance.field.question, channel: operator.name },
      provenance: { source: `operator:${operator.name}`, sourceRunId: outcome.sessionId },
    });

    // The dump: the same files at the step the answer was given, the recall
    // reported beside the fields, the receipt in the step's teach file with the
    // subject at its top, and the brain file in force on the manifest.
    expect(readdirSync(stepDir).sort()).toEqual([
      'captures',
      'captures.json',
      'fields.json',
      'observation.json',
      'plan.json',
      'screenshot.png',
      'snapshot.txt',
      'teach.json',
    ]);
    expect(fieldsFile.recall).toEqual({
      requests: 3,
      evidence: 1,
      latencyMs: expect.any(Number),
      fault: null,
      skipped: [],
    });
    expect(JSON.parse(readFileSync(join(stepDir, 'teach.json'), 'utf8'))).toEqual([
      {
        decisionId: fields[1]?.id,
        answer: guidance,
        subject: JOURNEY_SUBJECT,
        ref: answer?.id,
        outcome: 'inserted',
        fault: null,
      },
    ]);
    expect(existsSync(join(dumpDir, '01-steps', '04', 'teach.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dumpDir, 'manifest.json'), 'utf8'))).toMatchObject({
      sessionId: outcome.sessionId,
      settings: { brain: expect.stringMatching(/config\/brain\/memory\.json$/) },
    });
    expect(operator.notices[0]).toMatch(/^settings: .*brain .*config\/brain\/memory\.json/);
  });

  it('[BRW-23] [BRW-21] teaches the recorded answers again as unchanged, and replays the recorded page against the space through the module as it ships: every text the recorded answer cited found again, nothing leaking past the unit or the tenant', async () => {
    const service = moduleRef.get(SessionService);
    const before = rows().length;
    const again = await service.teachAgain(join(home, 'sessions'), false);
    expect(again).toMatchObject({
      dryRun: false,
      sessions: 1,
      answers: 1,
      documents: 1,
      outcomes: { unchanged: 1 },
      scopes: { declared: 1, fromDigest: 0, undeclared: 0 },
      stored: 0,
      retracted: 0,
      unanswered: 0,
      untaught: 0,
      unreadable: [],
      skipped: [],
    });
    expect(rows()).toHaveLength(before);
    expect(rows().find((row) => row.register === 'standing_answer')?.version).toBe(1);

    // Under the environment's tenant — the one the session ran under — with nothing judged again.
    const replay = await service.replayFields({
      sessionsDir: join(home, 'sessions'),
      tenant: undefined,
      sample: null,
      judge: false,
      retract: null,
      out: join(home, 'replays'),
    });
    expect(replay).toMatchObject({
      pages: 1,
      fields: 3,
      cited: 1,
      citedFound: 1,
      // The brain's own codec wrote the recorded goal, so the one cited text comes back word for word.
      citedBy: { equal: 1, identity: 0, contained: 0 },
      unitLeak: 0,
      tenantLeak: 0,
      recordedLatency: { p50: null, p90: null },
      judged: null,
      unresolvedRuns: 0,
      unresolvedOrchestrations: 0,
      retraction: null,
    });
    expect(replay.outDir.startsWith(join(home, 'replays'))).toBe(true);
    expect(readdirSync(replay.outDir).sort()).toEqual(['report.json', 'rows.csv']);
  });
});
