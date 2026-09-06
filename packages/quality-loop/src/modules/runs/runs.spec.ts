import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { QualityRunDto, QualityRunSummaryDto } from '@sysdesign/contracts';
import {
  ensureDatabase,
  QualityRun,
  QualityRunCriterion,
  QualityRunCriterionResult,
  QualityRunFinding,
  QualityRunIteration,
} from '@sysdesign/db';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm, result, tinyPipeline } from '../../core/testing';

// A directory of this file's own, so the assertions never see another suite's dump.
const DUMP_DIR = join(tmpdir(), `sysdesign-quality-loop-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { PIPELINES_TOKEN, QUALITY_LOOP_LLM } = await import('./tokens');

type Envelope<T> = { data: T };
type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

/** The real module over real HTTP; a fresh instance shares nothing but the database. */
async function boot(): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUALITY_LOOP_LLM)
    .useValue(
      fakeLlm(
        { criteria: [{ kind: 'must', statement: 'has text' }] },
        { text: 'made', parts: ['one'] },
        { findings: [] },
        {
          results: [result({ criterionId: 'c1', locationRefs: ['text'] })],
          advisoryVerdict: null,
        },
      ),
    )
    .overrideProvider(PIPELINES_TOKEN)
    .useValue(new Map([['tiny', tinyPipeline()]]))
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

const truncate = (em: EntityManager) =>
  em.fork().getConnection().execute('truncate table "quality_run" cascade');

describe('the HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  let runId = '';
  let record: QualityRunDto | null = null;

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

  it('[QL-10] lists declared pipelines, starts a run with 202, reports it, and writes its dump', async () => {
    const pipelines = (await (await fetch(`${url}/pipelines`)).json()) as Envelope<
      { id: string }[]
    >;
    expect(pipelines.data.map((pipeline) => pipeline.id)).toEqual(['tiny']);

    const started = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pipeline: 'tiny', goal: '# Goal\n\nMake a thing.' }),
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ runId: string; status: string }>;
    runId = data.runId;

    for (let attempt = 0; attempt < 50 && record?.status !== 'complete'; attempt++) {
      record = ((await (await fetch(`${url}/runs/${runId}`)).json()) as Envelope<QualityRunDto>)
        .data;
      if (record.status === 'running') await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!record) throw new Error('the run was never observed');
    expect(record).toMatchObject({
      status: 'complete',
      llm: { enabled: true, model: 'test-model' },
    });
    expect(record.trace).toMatchObject({ finalDecision: 'accept', stopReason: 'accepted' });
    expect(record.exchanges.map((exchange) => exchange.scope)).toEqual([
      'criteria',
      'producer',
      'critic.tiny.s1',
      'evaluator.tiny.s1',
    ]);
    // [QL-12] the wire summarises each exchange and never carries git or prompts.
    expect(record.exchanges[0]).toEqual({
      scope: 'criteria',
      ordinal: 1,
      outcome: 'ok',
      durationMs: expect.any(Number),
      startedAt: expect.any(String),
    });
    expect(record).not.toHaveProperty('git');
    expect(record.trace?.iterations[0]?.rendered).toBe('[text] made\n[part.1] one');

    const runDir = join(DUMP_DIR, runId);
    expect(existsSync(join(runDir, 'manifest.json'))).toBe(true);
    expect(readFileSync(join(runDir, '01-goal.md'), 'utf8')).toBe('# Goal\n\nMake a thing.\n');
    expect(readFileSync(join(DUMP_DIR, 'index.jsonl'), 'utf8')).toContain(runId);
  });

  it('[QL-13] lists the run newest first with its counts, filters, and survives a restart', async () => {
    if (!record) throw new Error('the previous case did not complete');

    const page = (await (await fetch(`${url}/runs`)).json()) as Page<QualityRunSummaryDto>;
    expect(page.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    expect(page.data[0]).toMatchObject({
      runId,
      pipeline: 'tiny',
      pipelineVersion: tinyPipeline().version,
      status: 'complete',
      finalDecision: 'accept',
      stopReason: 'accepted',
      iterations: 1,
      criteria: 1,
      exchangeCount: 4,
      overall: expect.any(Number),
    });
    expect((await fetch(`${url}/runs?limit=0`)).status).toBe(400);
    const none = (await (await fetch(`${url}/runs?status=running`)).json()) as Page<unknown>;
    expect(none.meta.total).toBe(0);
    const filtered = (await (
      await fetch(`${url}/runs?pipeline=tiny&limit=1&offset=0`)
    ).json()) as Page<unknown>;
    expect(filtered.data).toHaveLength(1);

    const fork = em.fork();
    expect(await fork.count(QualityRunCriterion, { run: runId })).toBe(1);
    expect(await fork.count(QualityRunIteration, { run: runId })).toBe(1);
    expect(await fork.count(QualityRunCriterionResult, { run: runId })).toBe(1);
    expect(await fork.count(QualityRunFinding, { run: runId })).toBe(0);

    // A second process: nothing in memory, the same database.
    const second = await boot();
    try {
      const again = (
        (await (await fetch(`${second.url}/runs/${runId}`)).json()) as Envelope<QualityRunDto>
      ).data;
      expect(again).toEqual(record);
      const listed = (await (await fetch(`${second.url}/runs`)).json()) as Page<unknown>;
      expect(listed.meta.total).toBe(1);
    } finally {
      await second.app.close();
    }
  });

  it('[QL-10] validates the body with zod and 404s an unknown pipeline or run', async () => {
    const bad = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pipeline: 'tiny', goal: '', maxIterations: 99 }),
    });
    expect(bad.status).toBe(400);
    expect(
      ((await bad.json()) as { issues: { path: string }[] }).issues.map((issue) => issue.path),
    ).toEqual(['goal', 'maxIterations']);

    const unknown = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pipeline: 'nope', goal: 'g' }),
    });
    expect(unknown.status).toBe(404);
    expect((await fetch(`${url}/runs/missing`)).status).toBe(404);
    expect((await (await fetch(`${url}/health`)).json()) as unknown).toEqual({ status: 'ok' });
  });

  // Last: booting another app sweeps every `running` row, so it must never overlap a live run.
  it('[QL-13] a run left running by a previous process is failed at boot', async () => {
    const fork = em.fork();
    fork.create(QualityRun, {
      id: 'stale-quality',
      pipeline: 'tiny',
      pipelineVersion: tinyPipeline().version,
      llm: { enabled: true, model: 'test-model', reason: null },
      request: { goal: 'g', outputProvided: false, maxIterations: 1 },
      git: { branch: '', headSha: '' },
      startedAt: new Date(),
    });
    await fork.flush();

    const third = await boot();
    try {
      const { data } = (await (
        await fetch(`${third.url}/runs/stale-quality`)
      ).json()) as Envelope<QualityRunDto>;
      expect(data).toMatchObject({
        status: 'failed',
        trace: null,
        error: { name: 'Interrupted', stack: null },
        finishedAt: expect.any(String),
      });
    } finally {
      await third.app.close();
    }
  });
});
