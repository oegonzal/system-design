import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import {
  MemoryEmbedding,
  OrchestrationRun,
  OrchestrationRunChild,
  QualityRun,
  truncateTestTables,
} from '@sysdesign/db';
import type { LlmClient } from '@sysdesign/llm';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { MEMORY_HEADING } from '../../orchestrators/memory/recall/inject';
import { GOAL } from '../../orchestrators/memory/testing';
import {
  bootApp,
  claimDumpDir,
  getJson,
  postJson,
  type Envelope,
  type Page,
} from '../http/testing';
import { fakeEmbeddings, InMemoryMemoryStore } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { CANNED, settledOrchestration } from './testing';

const DUMP_DIR = claimDumpDir('orchestration');
const TABLES = [OrchestrationRunChild, OrchestrationRun, MemoryEmbedding, QualityRun];

const embeddings = fakeEmbeddings();
const store = new InMemoryMemoryStore();

/**
 * The model behind the booted app, swappable between runs: every canned
 * answer by default, and a spec that needs the model to miss one stage
 * points it at a fake without that answer for the duration.
 */
const model: { current: LlmClient } = { current: fakeLlm(...CANNED) };
const switchable: LlmClient = {
  get model() {
    return model.current.model;
  },
  completeStructured: (request) => model.current.completeStructured(request),
};

/** The real modules over real HTTP with the REAL pipeline registry; only the model and the store are fakes. */
const boot = () =>
  bootApp([
    [QUALITY_LOOP_LLM, switchable],
    [EMBEDDING_CLIENT, embeddings],
    [MEMORY_STORE, store],
  ]);

/** A digest's criteria answer: the one canned object whose kinds are the digest's. */
const isDigestCriteria = (answer: unknown): boolean =>
  typeof answer === 'object' &&
  answer !== null &&
  'criteria' in answer &&
  Array.isArray(answer.criteria) &&
  answer.criteria.some((item: { kind?: string }) => item.kind === 'signal');

describe('the memory orchestration over the three pipelines', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;

  beforeAll(async () => {
    ({ app, url } = await boot());
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  const start = async (): Promise<string> => {
    const started = await postJson(url, '/orchestrations/memory', {
      pipeline: 'system-design',
      goal: GOAL,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{
      orchestrationRunId: string;
      status: string;
    }>;
    expect(data.status).toBe('running');
    return data.orchestrationRunId;
  };

  const settle = (id: string) => settledOrchestration(url, id);

  const run = async (runId: string | null): Promise<QualityRunDto> => {
    if (runId === null) throw new Error('a child run id was expected');
    return (await getJson<Envelope<QualityRunDto>>(url, `/runs/${runId}`)).data;
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
      criteriaProvided: false,

      adoptedFrom: null,
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
    const started = await postJson(url, '/orchestrations/memory/from-run', { runId: targetRunId });
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

  // Starting a composed-goal pipeline as a target is refused: recall would
  // rewrite a goal another program composed. Digesting a FINISHED one is a
  // different question — the target stands in, nothing runs it — and it is how
  it('[QL-16] a digest that derived no rubric is reported as never judged — `no-rubric` — not as a digest that fell short', async () => {
    // The live failure this rule exists for: the deriver missed the schema on
    // every attempt, the digest ran with no criteria, its controller escalated
    // at zero, and the orchestration said `not-accepted, kept 0 of 8`.
    const first = (await getJson<Page<OrchestrationRunDto>>(url, '/orchestrations')).data.at(-1);
    const targetRunId = first?.steps['target'].runIds[0];
    if (!targetRunId) throw new Error('the first run must have a target');
    model.current = fakeLlm(...CANNED.filter((answer) => !isDigestCriteria(answer)));
    try {
      const started = await postJson(url, '/orchestrations/memory/from-run', {
        runId: targetRunId,
      });
      expect(started.status).toBe(202);
      const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
      const record = await settle(data.orchestrationRunId);

      expect(record.status).toBe('complete');
      expect(record.steps['digest']).toMatchObject({
        status: 'complete',
        reason: 'no-rubric',
        counts: { memories: 2, kept: 0 },
      });
      expect(record.steps['store']).toMatchObject({
        status: 'skipped',
        reason: 'upstream-skipped',
        note: 'digest',
      });
      const digest = await run(record.steps['digest'].runIds[0] ?? null);
      expect(digest.status).toBe('complete');
      expect(digest.trace?.contract.criteria).toEqual([]);
    } finally {
      model.current = fakeLlm(...CANNED);
    }
  });

  // the studio's own runs reach the store. The digest child of the run above is
  // itself a composed-goal run, so it proves the path without a studio.
  it('[QL-17] a finished composed-goal run can be digested, though it could never be started as a target', async () => {
    const first = (
      (await (await fetch(`${url}/orchestrations?limit=10`)).json()) as Page<OrchestrationRunDto>
    ).data.at(-1);
    const digestRunId = first?.steps['digest'].runIds[0];
    if (!digestRunId) throw new Error('the first run must have digested something');

    const digestRun = (
      (await (await fetch(`${url}/runs/${digestRunId}`)).json()) as Envelope<{ pipeline: string }>
    ).data;
    expect(digestRun.pipeline).toBe('experience-digest');

    // Refused as a target…
    const asTarget = await postJson(url, '/orchestrations/memory', {
      pipeline: 'experience-digest',
      goal: GOAL,
    });
    expect(asTarget.status).toBe(400);
    expect(((await asTarget.json()) as { message: string }).message).toMatch(/not a target/);

    // …admitted from the finished run.
    const started = await postJson(url, '/orchestrations/memory/from-run', { runId: digestRunId });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);
    expect(record.steps['target']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: [digestRunId],
    });
    expect(record.steps['digest'].status).not.toBe('pending');
  });
});
