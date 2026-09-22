import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import { ensureDatabase, MemoryEmbedding } from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { MEMORY_HEADING } from '../memory/compose';
import { CANNED, fakeEmbeddings, GOAL, InMemoryMemoryStore } from '../memory/testing';

const DUMP_DIR = join(tmpdir(), `sysdesign-orchestration-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { QUALITY_LOOP_LLM } = await import('../runs/tokens');
const { EMBEDDING_CLIENT, MEMORY_STORE } = await import('../memory/tokens');

type Envelope<T> = { data: T };
type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

const embeddings = fakeEmbeddings();
const store = new InMemoryMemoryStore();

/** The real modules over real HTTP with the REAL pipeline registry; only the model and the store are fakes. */
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
    .execute(
      'truncate table "orchestration_run_child", "orchestration_run", "memory_embedding", "quality_run" cascade',
    );

describe('the memory orchestration over the three pipelines', () => {
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
    const started = await fetch(`${url}/orchestrations/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pipeline: 'system-design', goal: GOAL }),
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{
      orchestrationRunId: string;
      status: string;
    }>;
    expect(data.status).toBe('running');
    return data.orchestrationRunId;
  };

  const settle = async (id: string): Promise<OrchestrationRunDto> => {
    // Three chained runs even with a fake model take a while under a loaded CI box: a deadline, not a count.
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

  const run = async (runId: string | null): Promise<QualityRunDto> => {
    if (runId === null) throw new Error('a child run id was expected');
    return ((await (await fetch(`${url}/runs/${runId}`)).json()) as Envelope<QualityRunDto>).data;
  };

  it('[QL-16] on a cold start the target runs bare, the digest learns from it, and the store keeps what it endorsed', async () => {
    const record = await settle(await start());
    expect(record.status).toBe('complete');
    expect(record.error).toBeNull();
    expect(record.orchestrator).toBe('memory');
    expect(record.pipeline).toBe('system-design');
    expect(record.context['embedding']).toEqual({
      enabled: true,
      model: 'fake-embedding',
      reason: null,
    });
    expect(record.context['store']).toMatchObject({ ready: true, reason: null, chunks: 0 });
    expect(record.request).toEqual({
      goal: GOAL,
      outputProvided: false,
      maxIterations: 3,
      samples: null,
    });
    expect(Object.keys(record.steps)).toEqual(['recall', 'target', 'digest', 'store']);

    expect(record.steps['recall']).toMatchObject({
      status: 'skipped',
      reason: 'store-empty',
      runIds: [],
    });
    expect(record.steps['target']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { iterations: 1, overall: 100 },
    });
    expect(record.steps['digest']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { memories: 2, kept: 2 },
    });
    // Two lessons, each indexed by its condition and its instruction.
    expect(record.steps['store']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { chunks: 2, embedded: 4 },
    });

    const target = await run(record.steps['target'].runIds[0] ?? null);
    expect(target).toMatchObject({ pipeline: 'system-design', status: 'complete' });
    expect(target.trace?.finalDecision).toBe('accept');
    expect(target.request.goal).toBe(GOAL);
    const digest = await run(record.steps['digest'].runIds[0] ?? null);
    expect(digest).toMatchObject({ pipeline: 'experience-digest', status: 'complete' });

    expect(store.points.size).toBe(2);
    const chunks = [...store.points.values()];
    expect(chunks.map((chunk) => chunk.source.ref)).toEqual(['memory.1', 'memory.2']);
    expect(chunks[0].evidence).toEqual([{ kind: 'criterion', ref: 'c1' }]);
    expect(chunks[0].digestRunId).toBe(digest.runId);
    expect(await em.fork().count(MemoryEmbedding)).toBe(4);
  });

  it('[QL-16] [QL-17] the next run recalls that memory, hands the endorsed chunk to the target, digests the bare prompt, and embeds only what the cache lacks', async () => {
    const callsBefore = embeddings.calls.length;
    const record = await settle(await start());
    expect(record.status).toBe('complete');
    expect(record.context['store']).toMatchObject({ chunks: 2 });
    expect(record.steps['recall']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { candidates: 2, kept: 2, usable: 1, injected: 1 },
    });

    const recall = await run(record.steps['recall'].runIds[0] ?? null);
    expect(recall).toMatchObject({ pipeline: 'memory-recall', status: 'complete' });
    expect(recall.request.goal).toContain('### [m1] lesson · run');

    const target = await run(record.steps['target'].runIds[0] ?? null);
    expect(target.request.goal.startsWith(GOAL)).toBe(true);
    expect(target.request.goal).toContain(MEMORY_HEADING);
    expect(target.request.goal).toContain('- [m1] lesson · run');
    expect(target.request.goal).not.toContain('[m2]');

    const digest = await run(record.steps['digest'].runIds[0] ?? null);
    expect(digest.request.goal).not.toContain(MEMORY_HEADING);
    expect(digest.request.goal).toContain(GOAL);

    expect(record.steps['store']).toMatchObject({
      status: 'complete',
      counts: { chunks: 2, embedded: 0 },
    });
    expect(store.points.size).toBe(4);
    expect(embeddings.calls.slice(callsBefore)).toEqual([
      [expect.stringContaining('# Prompt — Serve an order history')],
    ]);
    expect(await em.fork().count(MemoryEmbedding)).toBe(5);
  });

  it('[QL-17] starting from a finished run digests it again, replacing its chunks under the same ids', async () => {
    const first = (
      (await (await fetch(`${url}/orchestrations?limit=10`)).json()) as Page<OrchestrationRunDto>
    ).data.at(-1);
    const targetRunId = first?.steps['target'].runIds[0];
    if (!targetRunId) throw new Error('the first run must have a target');
    const started = await fetch(`${url}/orchestrations/memory/from-run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: targetRunId }),
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);
    expect(record.status).toBe('complete');
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
    expect(record.steps['digest']).toMatchObject({
      status: 'complete',
      counts: { memories: 2, kept: 2 },
    });
    expect(record.steps['store']).toMatchObject({
      status: 'complete',
      counts: { chunks: 2, embedded: 0 },
    });
    expect(store.points.size).toBe(4);
    expect(
      [...store.points.values()].filter((chunk) => chunk.source.runId === targetRunId),
    ).toHaveLength(2);
  });

  it('[QL-16] lists orchestration runs newest first with the shared meta, filters, and 404s an unknown id', async () => {
    const page = (await (
      await fetch(`${url}/orchestrations?limit=10`)
    ).json()) as Page<OrchestrationRunDto>;
    expect(page.meta).toEqual({ total: 3, limit: 10, offset: 0 });
    expect(page.data.map((item) => item.orchestrator)).toEqual(['memory', 'memory', 'memory']);
    expect(page.data[0].startedAt >= page.data[1].startedAt).toBe(true);
    const byOrchestrator = (await (
      await fetch(`${url}/orchestrations?orchestrator=nope`)
    ).json()) as Page<OrchestrationRunDto>;
    expect(byOrchestrator.meta.total).toBe(0);
    const byPipeline = (await (
      await fetch(`${url}/orchestrations?pipeline=memory-recall`)
    ).json()) as Page<OrchestrationRunDto>;
    expect(byPipeline.meta.total).toBe(0);
    expect((await fetch(`${url}/orchestrations/${crypto.randomUUID()}`)).status).toBe(404);
  });
});
