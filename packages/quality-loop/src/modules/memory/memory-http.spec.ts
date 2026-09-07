import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { MemoryRunDto } from '@sysdesign/contracts';
import { ensureDatabase, MemoryRun } from '@sysdesign/db';
import { NoopEmbeddingClient } from '@sysdesign/llm';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { CANNED, GOAL, InMemoryMemoryStore } from './testing';

const DUMP_DIR = join(tmpdir(), `sysdesign-memory-http-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { QUALITY_LOOP_LLM } = await import('../runs/tokens');
const { EMBEDDING_CLIENT, MEMORY_STORE } = await import('./tokens');

type Envelope<T> = { data: T };

/** Without embeddings: the memory steps are honest about why they skipped, the target still runs. */
async function boot(): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUALITY_LOOP_LLM)
    .useValue(fakeLlm(...CANNED))
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
  em.fork().getConnection().execute('truncate table "memory_run", "quality_run" cascade');

const post = (url: string, path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the memory-runs HTTP surface', () => {
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

  const settle = async (memoryRunId: string): Promise<MemoryRunDto> => {
    // Three chained runs even with a fake model take a while under a loaded CI box: a deadline, not a count.
    let record: MemoryRunDto | null = null;
    for (
      const deadline = Date.now() + 120_000;
      Date.now() < deadline && record?.status !== 'complete' && record?.status !== 'failed';
    ) {
      record = (
        (await (await fetch(`${url}/memory-runs/${memoryRunId}`)).json()) as Envelope<MemoryRunDto>
      ).data;
      if (record.status === 'running') await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!record) throw new Error('the memory run was never observed');
    return record;
  };

  it('[QL-16] without embeddings the target still completes and every memory step says why it skipped', async () => {
    const started = await post(url, '/memory-runs', {
      pipeline: 'system-design',
      goal: GOAL,
      maxIterations: 2,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ memoryRunId: string }>;
    const record = await settle(data.memoryRunId);

    expect(record.status).toBe('complete');
    // The reason comes from the environment (Nx loads `.env` for local tasks), the client is the fake: assert only what the fake fixes.
    expect(record.embedding).toMatchObject({ enabled: false, model: null });
    expect(record.store).toMatchObject({ ready: false, reason: 'no-model', chunks: 0 });
    expect(record.request.maxIterations).toBe(2);
    expect(record.steps.recall).toMatchObject({ status: 'skipped', reason: 'embeddings-disabled' });
    expect(record.steps.target).toMatchObject({ status: 'complete', reason: null });
    expect(record.steps.digest).toMatchObject({ status: 'skipped', reason: 'embeddings-disabled' });
    expect(record.steps.store).toMatchObject({ status: 'skipped', reason: 'embeddings-disabled' });
    targetRunId = record.steps.target.runId;
    expect(targetRunId).not.toBeNull();
  });

  it('[QL-16] validates the body at the edge and refuses a memory pipeline as the target', async () => {
    const empty = await post(url, '/memory-runs', {});
    expect(empty.status).toBe(400);
    const issues = ((await empty.json()) as { issues: { path: string }[] }).issues.map(
      (i) => i.path,
    );
    expect(issues).toEqual(expect.arrayContaining(['pipeline', 'goal']));
    expect((await post(url, '/memory-runs', { pipeline: 'nope', goal: GOAL })).status).toBe(404);
    expect(
      (await post(url, '/memory-runs', { pipeline: 'memory-recall', goal: GOAL })).status,
    ).toBe(400);
    expect(
      (await post(url, '/memory-runs', { pipeline: 'experience-digest', goal: GOAL })).status,
    ).toBe(400);
    expect((await post(url, '/memory-runs/digest', { runId: 'nope' })).status).toBe(404);
  });

  it('[QL-16] digests an already persisted run through the same ledger, with recall and target provided', async () => {
    const started = await post(url, '/memory-runs/digest', { runId: targetRunId });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ memoryRunId: string }>;
    const record = await settle(data.memoryRunId);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBe('system-design');
    expect(record.steps.recall).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runId: null,
    });
    expect(record.steps.target).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runId: targetRunId,
    });
    expect(record.steps.digest).toMatchObject({ status: 'skipped', reason: 'embeddings-disabled' });
  });

  // Last: booting another app sweeps every `running` row, so it must never overlap a live run.
  it('[QL-16] a memory run left running by a dead process is failed at boot, its steps marked interrupted', async () => {
    const fork = em.fork();
    fork.create(MemoryRun, {
      id: crypto.randomUUID(),
      pipeline: 'system-design',
      status: 'running',
      request: { goal: GOAL, outputProvided: false, maxIterations: 1 },
      embedding: { enabled: false, model: null, reason: 'no-key' },
      store: { ready: false, reason: 'no-model', model: null, collection: null, chunks: 0 },
      steps: {
        recall: {
          status: 'complete',
          reason: 'store-empty',
          runId: null,
          note: null,
          counts: {},
          startedAt: null,
          finishedAt: null,
        },
        target: {
          status: 'running',
          reason: null,
          runId: null,
          note: null,
          counts: {},
          startedAt: null,
          finishedAt: null,
        },
        digest: {
          status: 'pending',
          reason: null,
          runId: null,
          note: null,
          counts: {},
          startedAt: null,
          finishedAt: null,
        },
        store: {
          status: 'pending',
          reason: null,
          runId: null,
          note: null,
          counts: {},
          startedAt: null,
          finishedAt: null,
        },
      },
      startedAt: new Date(),
    });
    await fork.flush();
    const stale = (await fork.find(MemoryRun, { status: 'running' }))[0];

    const second = await boot();
    try {
      const swept = (
        (await (
          await fetch(`${second.url}/memory-runs/${stale.id}`)
        ).json()) as Envelope<MemoryRunDto>
      ).data;
      expect(swept.status).toBe('failed');
      expect(swept.error?.name).toBe('Interrupted');
      expect(swept.steps.recall.status).toBe('complete');
      expect(swept.steps.target).toMatchObject({ status: 'failed', reason: 'interrupted' });
      expect(swept.steps.digest).toMatchObject({ status: 'skipped', reason: 'interrupted' });
      expect(swept.steps.store).toMatchObject({ status: 'skipped', reason: 'interrupted' });
    } finally {
      await second.app.close();
    }
  });
});
