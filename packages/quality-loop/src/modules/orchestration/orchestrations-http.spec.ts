import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto, RouteReportDto } from '@sysdesign/contracts';
import { ensureDatabase, OrchestrationRun } from '@sysdesign/db';
import { NoopEmbeddingClient } from '@sysdesign/llm';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { CANNED, GOAL, InMemoryMemoryStore } from '../memory/testing';
import type { OrchestrationRunRepository } from './ports';

const DUMP_DIR = join(tmpdir(), `sysdesign-orchestration-http-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { QUALITY_LOOP_LLM } = await import('../runs/tokens');
const { EMBEDDING_CLIENT, MEMORY_STORE } = await import('../memory/tokens');
const { ORCHESTRATION_RUN_REPOSITORY } = await import('./tokens');

type Envelope<T> = { data: T };

/** What the fake answers the brief classifier with: the schema is locked to the registered routes. */
const ROUTE = { pipeline: 'system-design', rationale: 'a system to design' };

/** Without embeddings: the memory steps are honest about why they skipped, the target still runs. */
async function boot(): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUALITY_LOOP_LLM)
    .useValue(fakeLlm(...CANNED, ROUTE))
    .overrideProvider(EMBEDDING_CLIENT)
    .useValue(new NoopEmbeddingClient())
    .overrideProvider(MEMORY_STORE)
    .useValue(new InMemoryMemoryStore(null))
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

const truncate = (em: EntityManager) =>
  em
    .fork()
    .getConnection()
    .execute(
      'truncate table "orchestration_run_child", "orchestration_run", "quality_run" cascade',
    );

const post = (url: string, path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the orchestrations HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  let targetRunId: string | null = null;

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await boot());
    em = app.get(EntityManager);
    await truncate(em);
  });

  afterAll(async () => {
    await truncate(em);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  const settle = async (id: string): Promise<OrchestrationRunDto> => {
    let record: OrchestrationRunDto | null = null;
    for (
      const deadline = Date.now() + 120_000;
      Date.now() < deadline && record?.status !== 'complete' && record?.status !== 'failed';
    ) {
      record = (
        (await (await fetch(`${url}/orchestrations/${id}`)).json()) as Envelope<OrchestrationRunDto>
      ).data;
      if (record.status === 'running') await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!record) throw new Error('the orchestration run was never observed');
    return record;
  };

  it('[QL-16] without embeddings the target still completes and every memory step says why it did not run', async () => {
    const started = await post(url, '/orchestrations/memory', {
      pipeline: 'system-design',
      goal: GOAL,
      maxIterations: 2,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);

    expect(record.status).toBe('complete');
    // The suite pins the loop deterministic, so the reason is exact whatever the developer's `.env` holds.
    expect(record.context['embedding']).toEqual({
      enabled: false,
      model: null,
      reason: 'deterministic',
    });
    expect(record.context['store']).toMatchObject({ ready: false, reason: 'no-model', chunks: 0 });
    expect(record.request.maxIterations).toBe(2);
    expect(record.steps['recall']).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
    });
    expect(record.steps['target']).toMatchObject({ status: 'complete', reason: null });
    expect(record.steps['digest']).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
    });
    // Store needs the digest's output; the digest said why it gave none.
    expect(record.steps['store']).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'digest',
    });
    targetRunId = record.steps['target'].runIds[0] ?? null;
    expect(targetRunId).not.toBeNull();
    const child = (
      (await (await fetch(`${url}/runs/${targetRunId}`)).json()) as Envelope<{
        request: { maxIterations: number; goal: string };
      }>
    ).data;
    expect(child.request).toMatchObject({ maxIterations: 2, goal: GOAL });
  });

  it('[QL-16] validates the body at the edge, refuses a memory pipeline as the target, and 404s the unknown', async () => {
    const empty = await post(url, '/orchestrations/memory', {});
    expect(empty.status).toBe(400);
    const issues = ((await empty.json()) as { issues: { path: string }[] }).issues.map(
      (i) => i.path,
    );
    // The edge no longer demands a pipeline: whether one is named is the orchestrator's declaration.
    expect(issues).toEqual(['goal']);
    const unnamed = await post(url, '/orchestrations/memory', { goal: GOAL });
    expect(unnamed.status).toBe(400);
    expect(((await unnamed.json()) as { message: string }).message).toMatch(/takes a target/);
    expect(
      (
        await post(url, '/orchestrations/memory', {
          pipeline: 'system-design',
          goal: GOAL,
          samples: 9,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post(url, '/orchestrations/memory', { pipeline: 'nope', goal: GOAL })).status,
    ).toBe(404);
    expect(
      (await post(url, '/orchestrations/memory', { pipeline: 'memory-recall', goal: GOAL })).status,
    ).toBe(400);
    expect(
      (await post(url, '/orchestrations/memory', { pipeline: 'experience-digest', goal: GOAL }))
        .status,
    ).toBe(400);
    expect(
      (await post(url, '/orchestrations/nope', { pipeline: 'system-design', goal: GOAL })).status,
    ).toBe(404);
    expect((await post(url, '/orchestrations/memory/from-run', { runId: 'nope' })).status).toBe(
      404,
    );
    expect((await fetch(`${url}/orchestrations/not-a-uuid`)).status).toBe(404);
    expect((await post(url, '/memory/not-a-uuid/reindex', {})).status).toBe(404);
  });

  it('[QL-16] starts from an already persisted run through the same ledger, with recall and target provided', async () => {
    const started = await post(url, '/orchestrations/memory/from-run', { runId: targetRunId });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBe('system-design');
    expect(record.steps['recall']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: [],
    });
    expect(record.steps['target']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: [targetRunId],
    });
    expect(record.request).toMatchObject({
      goal: GOAL,
      outputProvided: false,
      criteriaProvided: false,
      maxIterations: 2,
    });
    expect(record.steps['digest']).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
    });
  });

  it('[QL-19] the router refuses a named pipeline, reports the judge it would pick, and judges once with it', async () => {
    const named = await post(url, '/orchestrations/router', {
      pipeline: 'system-design',
      goal: GOAL,
    });
    expect(named.status).toBe(400);
    expect(((await named.json()) as { message: string }).message).toMatch(/chooses its own/);

    const report = await post(url, '/router/report', { goal: GOAL });
    expect(report.status).toBe(200);
    expect(((await report.json()) as Envelope<RouteReportDto>).data).toEqual({
      routes: [
        { id: 'system-design', description: expect.any(String) },
        { id: 'agentic-design', description: expect.any(String) },
      ],
      pipeline: 'system-design',
      rationale: 'a system to design',
    });

    const started = await post(url, '/orchestrations/router', { goal: GOAL });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.request).toEqual({
      goal: GOAL,
      outputProvided: false,
      criteriaProvided: false,
      maxIterations: 1,
      samples: null,
    });
    expect(record.context).toEqual({
      classifier: { enabled: true, model: 'test-model', reason: null },
    });
    expect(record.steps['classify']).toMatchObject({
      status: 'complete',
      note: 'a system to design',
      counts: { routes: 2 },
      runIds: [],
    });
    expect(record.steps['judge']).toMatchObject({ status: 'complete', counts: { iterations: 1 } });
    const child = (
      (await (await fetch(`${url}/runs/${record.steps['judge'].runIds[0]}`)).json()) as Envelope<{
        pipeline: string;
        request: { maxIterations: number };
      }>
    ).data;
    expect(child.pipeline).toBe('system-design');
    expect(child.request.maxIterations).toBe(1);
  });

  it('[QL-19] calibration runs a goal `samples` times and reconciles; second opinion judges a stored artifact again', async () => {
    const calibration = await post(url, '/orchestrations/calibration', {
      pipeline: 'system-design',
      goal: GOAL,
      samples: 2,
      maxIterations: 1,
    });
    expect(calibration.status).toBe(202);
    const calibrated = await settle(
      ((await calibration.json()) as Envelope<{ orchestrationRunId: string }>).data
        .orchestrationRunId,
    );
    expect(calibrated.status).toBe('complete');
    expect(calibrated.request.samples).toBe(2);
    expect(calibrated.steps['panel']).toMatchObject({
      status: 'complete',
      counts: { lenses: 1, samples: 2, completed: 2, failed: 0 },
    });
    expect(calibrated.steps['panel'].runIds).toHaveLength(2);
    expect(calibrated.steps['reconcile']).toMatchObject({
      status: 'complete',
      runIds: [],
      counts: { runs: 2, decisions: 1 },
    });
    expect(calibrated.steps['reconcile'].report).toMatchObject({
      alignment: 'produced',
      runs: 2,
      overall: { n: 2, range: 0 },
    });

    const second = await post(url, '/orchestrations/second-opinion/from-run', {
      runId: targetRunId,
      samples: 2,
    });
    expect(second.status).toBe(202);
    const judged = await settle(
      ((await second.json()) as Envelope<{ orchestrationRunId: string }>).data.orchestrationRunId,
    );
    expect(judged.status).toBe('complete');
    expect(judged.pipeline).toBe('system-design');
    expect(judged.request.samples).toBe(2);
    expect(judged.steps['first']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: [targetRunId],
    });
    expect(judged.steps['panel']).toMatchObject({
      status: 'complete',
      counts: { completed: 2, failed: 0 },
    });
    expect(judged.steps['reconcile']).toMatchObject({
      status: 'complete',
      counts: { runs: 3 },
    });
    expect(judged.steps['reconcile'].report).toMatchObject({ alignment: 'provided', runs: 3 });
    const opinion = (
      (await (await fetch(`${url}/runs/${judged.steps['panel'].runIds[0]}`)).json()) as Envelope<{
        request: { outputProvided: boolean; maxIterations: number };
      }>
    ).data;
    expect(opinion.request).toMatchObject({
      outputProvided: true,
      criteriaProvided: false,
      maxIterations: 1,
    });
  });

  // Last: booting another app sweeps every `running` row, so it must never overlap a live run.
  it('[QL-16] a run left running by a dead process is failed at boot, its steps marked interrupted', async () => {
    const fork = em.fork();
    const step = (status: 'complete' | 'running' | 'pending', reason: string | null = null) => ({
      status,
      reason,
      runIds: [],
      note: null,
      counts: {},
      report: null,
      startedAt: null,
      finishedAt: null,
    });
    fork.create(OrchestrationRun, {
      id: crypto.randomUUID(),
      orchestrator: 'memory',
      pipeline: 'system-design',
      status: 'running',
      request: {
        goal: GOAL,
        outputProvided: false,
        criteriaProvided: false,
        maxIterations: 1,
        samples: null,
      },
      context: {},
      steps: {
        recall: step('complete', 'store-empty'),
        target: step('running'),
        digest: step('pending'),
        store: step('pending'),
      },
      startedAt: new Date(),
    });
    await fork.flush();
    const stale = (await fork.find(OrchestrationRun, { status: 'running' }))[0];

    const second = await boot();
    try {
      const swept = (
        (await (
          await fetch(`${second.url}/orchestrations/${stale.id}`)
        ).json()) as Envelope<OrchestrationRunDto>
      ).data;
      expect(swept.status).toBe('failed');
      expect(swept.error?.name).toBe('Interrupted');
      expect(swept.steps['recall'].status).toBe('complete');
      expect(swept.steps['target']).toMatchObject({ status: 'failed', reason: 'interrupted' });
      expect(swept.steps['digest']).toMatchObject({ status: 'skipped', reason: 'interrupted' });
      expect(swept.steps['store']).toMatchObject({ status: 'skipped', reason: 'interrupted' });

      // A late flush from the dead process must not resurrect the swept row.
      const repository = second.app.get<OrchestrationRunRepository>(ORCHESTRATION_RUN_REPOSITORY);
      await repository.update({
        ...swept,
        steps: { ...swept.steps, target: { ...swept.steps['target'], status: 'running' } },
      });
      await repository.close({ ...swept, status: 'complete', error: null });
      const after = (
        (await (
          await fetch(`${second.url}/orchestrations/${stale.id}`)
        ).json()) as Envelope<OrchestrationRunDto>
      ).data;
      expect(after.status).toBe('failed');
      expect(after.steps['target'].status).toBe('failed');
    } finally {
      await second.app.close();
    }
  });
});
