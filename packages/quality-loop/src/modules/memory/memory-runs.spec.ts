import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { MemoryRunDto, QualityRunDto } from '@sysdesign/contracts';
import { ensureDatabase, MemoryEmbedding } from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { MEMORY_HEADING } from './compose';
import { CANNED, fakeEmbeddings, GOAL, InMemoryMemoryStore } from './testing';

const DUMP_DIR = join(tmpdir(), `sysdesign-memory-run-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { QUALITY_LOOP_LLM } = await import('../runs/tokens');
const { EMBEDDING_CLIENT, MEMORY_STORE } = await import('./tokens');

type Envelope<T> = { data: T };
type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

const embeddings = fakeEmbeddings();
const store = new InMemoryMemoryStore();

/** The real module over real HTTP with the REAL pipeline registry; only the model and the store are fakes. */
async function boot(): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUALITY_LOOP_LLM)
    .useValue(fakeLlm(...CANNED))
    .overrideProvider(EMBEDDING_CLIENT)
    .useValue(embeddings)
    .overrideProvider(MEMORY_STORE)
    .useValue(store)
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

const truncate = (em: EntityManager) =>
  em
    .fork()
    .getConnection()
    .execute('truncate table "memory_run", "memory_embedding", "quality_run" cascade');

describe('a memory run over the three pipelines', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;

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

  const start = async (): Promise<string> => {
    const started = await fetch(`${url}/memory-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pipeline: 'system-design', goal: GOAL }),
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ memoryRunId: string; status: string }>;
    expect(data.status).toBe('running');
    return data.memoryRunId;
  };

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

  const run = async (runId: string | null): Promise<QualityRunDto> => {
    if (runId === null) throw new Error('a child run id was expected');
    return ((await (await fetch(`${url}/runs/${runId}`)).json()) as Envelope<QualityRunDto>).data;
  };

  it('[QL-16] on a cold start the target runs bare, the digest learns from it, and the store keeps what it endorsed', async () => {
    const record = await settle(await start());
    expect(record.status).toBe('complete');
    expect(record.error).toBeNull();
    expect(record.embedding).toEqual({ enabled: true, model: 'fake-embedding', reason: null });
    expect(record.store).toMatchObject({ ready: true, reason: null, chunks: 0 });
    expect(record.request).toEqual({ goal: GOAL, outputProvided: false, maxIterations: 3 });

    expect(record.steps.recall).toMatchObject({
      status: 'skipped',
      reason: 'store-empty',
      runId: null,
    });
    expect(record.steps.target).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { iterations: 1, overall: 100 },
    });
    expect(record.steps.digest).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { memories: 2, kept: 2 },
    });
    expect(record.steps.store).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { chunks: 2, embedded: 2 },
    });

    const target = await run(record.steps.target.runId);
    expect(target).toMatchObject({ pipeline: 'system-design', status: 'complete' });
    expect(target.trace?.finalDecision).toBe('accept');
    expect(target.request.goal).toBe(GOAL);
    const digest = await run(record.steps.digest.runId);
    expect(digest).toMatchObject({ pipeline: 'experience-digest', status: 'complete' });
    expect(digest.trace?.finalDecision).toBe('accept');

    expect(store.points.size).toBe(2);
    const chunks = [...store.points.values()];
    expect(chunks.map((chunk) => chunk.source)).toEqual([
      {
        runId: target.runId,
        pipeline: 'system-design',
        kind: 'lesson',
        ref: 'memory.1',
        decision: 'accept',
        iteration: 1,
        when: target.startedAt.slice(0, 10),
      },
      {
        runId: target.runId,
        pipeline: 'system-design',
        kind: 'lesson',
        ref: 'memory.2',
        decision: 'accept',
        iteration: 1,
        when: target.startedAt.slice(0, 10),
      },
    ]);
    expect(chunks[0].evidence).toEqual([{ kind: 'criterion', ref: 'c1' }]);
    expect(chunks[0].digestRunId).toBe(digest.runId);
    expect(await em.fork().count(MemoryEmbedding)).toBe(2);
  });

  it('[QL-16] [QL-17] the next run on the goal recalls that memory, hands the endorsed chunk to the target, digests the bare prompt, and embeds only what the cache lacks', async () => {
    const callsBefore = embeddings.calls.length;
    const record = await settle(await start());
    expect(record.status).toBe('complete');
    expect(record.store.chunks).toBe(2);
    expect(record.steps.recall).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { candidates: 2, kept: 2, usable: 1, injected: 1 },
    });

    const recall = await run(record.steps.recall.runId);
    expect(recall).toMatchObject({ pipeline: 'memory-recall', status: 'complete' });
    expect(recall.trace?.finalDecision).toBe('accept');
    expect(recall.request.goal).toContain('### [m1] lesson · run');

    const target = await run(record.steps.target.runId);
    expect(target.request.goal.startsWith(GOAL)).toBe(true);
    expect(target.request.goal).toContain(MEMORY_HEADING);
    expect(target.request.goal).toContain('- [m1] lesson · run');
    expect(target.request.goal).not.toContain('[m2]');

    const digest = await run(record.steps.digest.runId);
    expect(digest.request.goal).not.toContain(MEMORY_HEADING);
    expect(digest.request.goal).toContain(GOAL);

    expect(record.steps.store).toMatchObject({
      status: 'complete',
      counts: { chunks: 2, embedded: 0 },
    });
    expect(store.points.size).toBe(4);
    expect(embeddings.calls.slice(callsBefore)).toEqual([
      [expect.stringContaining('# Prompt — Serve an order history')],
    ]);
    expect(await em.fork().count(MemoryEmbedding)).toBe(3);
  });

  it('[QL-16] lists memory runs newest first with the shared meta, and 404s an unknown id', async () => {
    const page = (await (await fetch(`${url}/memory-runs?limit=10`)).json()) as Page<MemoryRunDto>;
    expect(page.meta).toEqual({ total: 2, limit: 10, offset: 0 });
    expect(page.data.map((item) => item.pipeline)).toEqual(['system-design', 'system-design']);
    expect(page.data[0].startedAt >= page.data[1].startedAt).toBe(true);
    const filtered = (await (
      await fetch(`${url}/memory-runs?pipeline=memory-recall`)
    ).json()) as Page<MemoryRunDto>;
    expect(filtered.meta.total).toBe(0);
    expect((await fetch(`${url}/memory-runs/${crypto.randomUUID()}`)).status).toBe(404);
  });
});
