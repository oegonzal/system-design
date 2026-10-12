import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  BrowserDecision,
  BrowserSession,
  BrowserTask,
  ensureDatabase,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { MikroOrmLedger } from './mikro-orm-ledger';

const RAILS = {
  targetDone: null,
  maxTasks: 2,
  maxMinutes: 30,
  maxConsecutiveFailures: 3,
  maxBrainFaults: 3,
  maxUnreadablePages: 3,
  maxStalledSteps: 3,
};
const T0 = new Date('2026-10-03T10:00:00.000Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

describe('the ledger in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await truncateTestTables(orm.em, [BrowserSession, BrowserTask, BrowserDecision]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [BrowserSession, BrowserTask, BrowserDecision]);
    await orm.close(true);
  });

  it('[BRW-5] writes a session, its beats, its units of work and its decisions on forks of their own, and reads them back', async () => {
    const ledger = new MikroOrmLedger(orm.em);
    const sessionId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const planId = crypto.randomUUID();
    const askedId = crypto.randomUUID();
    const cachedId = crypto.randomUUID();

    await ledger.openSession({
      id: sessionId,
      dumpRunId: '2026-10-03T10-00-00-000-abcdef-session',
      goalPath: 'goals/test.md',
      goalHash: 'a'.repeat(64),
      goalMarkdown: '# Mission\n',
      profile: 'spec',
      subject: 'Alex Example',
      headed: false,
      limits: RAILS,
      startedAt: T0,
    });
    const [opened] = await ledger.listSessions(10);
    expect(opened).toMatchObject({
      id: sessionId,
      subject: 'Alex Example',
      status: 'running',
      terminationReason: null,
      steps: 0,
      startedAt: T0.toISOString(),
      heartbeatAt: T0.toISOString(),
      finishedAt: null,
      limits: RAILS,
    });

    await ledger.heartbeat(sessionId, at(15), 2);
    await ledger.recordCriteria(sessionId, {
      'browser-step': [{ id: 'c1', kind: 'progress', statement: 'Open the listing.' }],
    });
    const beating = await ledger.getSession(sessionId);
    expect(beating?.heartbeatAt).toBe(at(15).toISOString());
    expect(beating?.steps).toBe(2);
    const row = await orm.em.fork().findOneOrFail(BrowserSession, { id: sessionId });
    expect(row.criteria?.['browser-step']?.[0]?.id).toBe('c1');

    await ledger.openTask({
      id: taskId,
      sessionId,
      ordinal: 1,
      label: 'Senior Engineer at Acme',
      externalRef: 'https://jobs.example.test/42',
      facets: [{ name: 'company', value: 'Acme' }],
      startStep: 2,
      startedAt: at(20),
    });
    await ledger.recordDecision({
      id: planId,
      sessionId,
      taskId: null,
      step: 1,
      ordinal: 1,
      kind: 'step-plan',
      source: 'loop',
      loopRunId: 'run-1',
      loopOrchestrationId: null,
      ref: null,
      question: null,
      answer: null,
      confidence: null,
      payload: { assessment: 'a listing' },
      durationMs: 90_000,
      createdAt: at(10),
    });
    await ledger.recordDecision({
      id: askedId,
      sessionId,
      taskId,
      step: 3,
      ordinal: 2,
      kind: 'field-answer',
      source: 'operator',
      loopRunId: 'run-3',
      loopOrchestrationId: 'orchestration-3',
      ref: 'e2',
      question: 'Work authorisation',
      answer: 'Yes',
      confidence: 'low',
      payload: { route: 'fill', basis: [] },
      durationMs: 60_000,
      createdAt: at(40),
    });
    // A later form the cache answered: operator-sourced too, but taught earlier, so not part of this document.
    await ledger.recordDecision({
      id: cachedId,
      sessionId,
      taskId,
      step: 4,
      ordinal: 1,
      kind: 'field-answer',
      source: 'operator',
      loopRunId: 'run-4',
      loopOrchestrationId: 'orchestration-4',
      ref: 'e2',
      question: 'Work authorisation',
      answer: 'Yes',
      confidence: 'low',
      payload: { route: 'fill', cached: true },
      durationMs: 1_000,
      createdAt: at(45),
    });
    await ledger.recordTeaching([askedId], 'teach-1');
    await ledger.recordTeaching([], 'teach-nothing');
    await ledger.closeTask(taskId, {
      status: 'complete',
      outcome: 'done',
      endStep: 4,
      finishedAt: at(50),
    });
    await ledger.closeSession(sessionId, {
      status: 'complete',
      termination: {
        reason: 'mission-stop',
        cause: 'mission-complete',
        ending: 'complete',
        detail: 'nothing left',
      },
      steps: 5,
      finishedAt: at(60),
      error: null,
    });

    const detail = await ledger.getSession(sessionId);
    expect(detail).toMatchObject({
      status: 'complete',
      terminationReason: 'mission-stop',
      terminationCause: 'mission-complete',
      terminationDetail: 'nothing left',
      steps: 5,
      finishedAt: at(60).toISOString(),
      heartbeatAt: at(60).toISOString(),
      error: null,
    });
    expect(detail?.tasks).toEqual([
      {
        id: taskId,
        sessionId,
        ordinal: 1,
        label: 'Senior Engineer at Acme',
        externalRef: 'https://jobs.example.test/42',
        facets: [{ name: 'company', value: 'Acme' }],
        status: 'complete',
        outcome: 'done',
        startStep: 2,
        endStep: 4,
        startedAt: at(20).toISOString(),
        finishedAt: at(50).toISOString(),
      },
    ]);
    // The teaching lands on the rows the document carried, and on no other operator row.
    expect(detail?.decisions.map((d) => [d.id, d.taskId, d.teachOrchestrationId])).toEqual([
      [planId, null, null],
      [askedId, taskId, 'teach-1'],
      [cachedId, taskId, null],
    ]);
    expect(detail?.decisions[1]).toMatchObject({
      kind: 'field-answer',
      source: 'operator',
      loopRunId: 'run-3',
      loopOrchestrationId: 'orchestration-3',
      ref: 'e2',
      question: 'Work authorisation',
      answer: 'Yes',
      confidence: 'low',
      payload: { route: 'fill', basis: [] },
      durationMs: 60_000,
      createdAt: at(40).toISOString(),
    });
    expect(await ledger.getSession(crypto.randomUUID())).toBeNull();
  });

  it('[BRW-4] records a session that reached its target as complete, and reads rails stored before the target existed as having none', async () => {
    const ledger = new MikroOrmLedger(orm.em);
    const reached = crypto.randomUUID();
    await ledger.openSession({
      id: reached,
      dumpRunId: '2026-10-09T10-00-00-000-abcdef-session',
      goalPath: 'goals/test.md',
      goalHash: 'b'.repeat(64),
      goalMarkdown: '# Mission\n',
      profile: 'spec',
      subject: 'Alex Example',
      headed: false,
      limits: { ...RAILS, targetDone: 2 },
      startedAt: T0,
    });
    await ledger.closeSession(reached, {
      status: 'complete',
      termination: { reason: 'target-reached', detail: '2 of 2 units of work closed done' },
      steps: 7,
      finishedAt: at(60),
      error: null,
    });
    expect(await ledger.getSession(reached)).toMatchObject({
      status: 'complete',
      terminationReason: 'target-reached',
      terminationCause: null,
      limits: { targetDone: 2 },
    });

    // A row written before the field: its stored rails have no target, and read as none.
    const older = crypto.randomUUID();
    await ledger.openSession({
      id: older,
      dumpRunId: '2026-10-08T10-00-00-000-abcdef-session',
      goalPath: 'goals/test.md',
      goalHash: 'c'.repeat(64),
      goalMarkdown: '# Mission\n',
      profile: 'spec',
      subject: 'Alex Example',
      headed: false,
      limits: RAILS,
      startedAt: T0,
    });
    const { targetDone: _dropped, ...stored } = RAILS;
    await orm.em.fork().nativeUpdate(BrowserSession, { id: older }, { limits: stored as never });
    expect((await ledger.getSession(older))?.limits.targetDone).toBeNull();
  });
});
