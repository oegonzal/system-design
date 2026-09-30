import type { INestApplication } from '@nestjs/common';
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
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { disabledLlm, fakeLlm, result, tinyPipeline } from '../../core/testing';
import {
  bootApp,
  claimDumpDir,
  getJson,
  postJson,
  truncate,
  type Envelope,
  type Page,
} from '../http/testing';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM } from './tokens';

const DUMP_DIR = claimDumpDir('quality-loop');
const TABLES = ['quality_run'];

const tinyOnly = () => [PIPELINES_TOKEN, new Map([['tiny', tinyPipeline()]])] as const;

/** The real module over real HTTP; a fresh instance shares nothing but the database. */
const boot = () =>
  bootApp([
    [
      QUALITY_LOOP_LLM,
      fakeLlm(
        { criteria: [{ kind: 'must', statement: 'has text' }] },
        { text: 'made', parts: ['one'] },
        { findings: [] },
        {
          results: [result({ criterionId: 'c1', locationRefs: ['text'] })],
          advisoryVerdict: null,
        },
      ),
    ],
    tinyOnly(),
  ]);

describe('the HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  let runId = '';
  let record: QualityRunDto | null = null;

  /** The run once it is no longer running — a fake model settles within a second. */
  const settledRun = async (id: string): Promise<QualityRunDto> => {
    let run: QualityRunDto | null = null;
    for (let attempt = 0; attempt < 50 && run?.status !== 'complete'; attempt++) {
      run = (await getJson<Envelope<QualityRunDto>>(url, `/runs/${id}`)).data;
      if (run.status === 'running') await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!run) throw new Error('the run was never observed');
    return run;
  };

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await boot());
    em = app.get(EntityManager);
    await truncate(em, TABLES);
  });

  afterAll(async () => {
    await truncate(em, TABLES);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  it('[QL-10] lists declared pipelines, starts a run with 202, reports it, and writes its dump', async () => {
    const pipelines = (await (await fetch(`${url}/pipelines`)).json()) as Envelope<
      { id: string }[]
    >;
    expect(pipelines.data.map((pipeline) => pipeline.id)).toEqual(['tiny']);

    const started = await postJson(url, '/runs', {
      pipeline: 'tiny',
      goal: '# Goal\n\nMake a thing.',
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ runId: string; status: string }>;
    runId = data.runId;

    record = await settledRun(runId);
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
    const bad = await postJson(url, '/runs', { pipeline: 'tiny', goal: '', maxIterations: 99 });
    expect(bad.status).toBe(400);
    expect(
      ((await bad.json()) as { issues: { path: string }[] }).issues.map((issue) => issue.path),
    ).toEqual(['goal', 'maxIterations']);

    const unknown = await postJson(url, '/runs', { pipeline: 'nope', goal: 'g' });
    expect(unknown.status).toBe(404);
    expect((await fetch(`${url}/runs/missing`)).status).toBe(404);
    expect((await (await fetch(`${url}/health`)).json()) as unknown).toEqual({
      status: 'ok',
      llm: { enabled: true, model: 'test-model', reason: null },
    });
  });

  it('[QL-20] a supplied rubric skips the criteria exchange and is persisted under its own ids', async () => {
    const rubric = [
      { id: 'req-1', kind: 'must', statement: 'has text' },
      { id: 'nfr-1', kind: 'nice', statement: 'has parts' },
    ];
    const started = await postJson(url, '/runs', {
      pipeline: 'tiny',
      goal: '# Goal',
      criteria: rubric,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ runId: string }>;
    const run = await settledRun(data.runId);
    expect(run.request).toMatchObject({ criteriaProvided: true });
    expect(run.exchanges.map((exchange) => exchange.scope)).toEqual([
      'producer',
      'critic.tiny.s1',
      'evaluator.tiny.s1',
    ]);
    expect(run.trace?.contract.criteria).toEqual(rubric);
    const rows = await em
      .fork()
      .find(QualityRunCriterion, { run: data.runId }, { orderBy: { position: 'asc' } });
    expect(rows.map((row) => row.criterionId)).toEqual(['req-1', 'nfr-1']);
  });

  it('[QL-20] a rubric that does not fit the pipeline is 400 with the offending path, and no row is written', async () => {
    const before = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    for (const criteria of [
      [{ id: 'c1', kind: 'bogus', statement: 's' }],
      [
        { id: 'c1', kind: 'must', statement: 's' },
        { id: 'c1', kind: 'must', statement: 't' },
      ],
      Array.from({ length: tinyPipeline().task.maxCriteria + 1 }, (_, i) => ({
        id: `c${i + 1}`,
        kind: 'must',
        statement: 's',
      })),
    ]) {
      const response = await postJson(url, '/runs', { pipeline: 'tiny', goal: 'g', criteria });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { issues: { path: string }[] };
      expect(body.issues[0].path).toBe('criteria');
    }
    const after = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    expect(after).toBe(before);
  });

  it('[QL-20] POST /criteria derives a rubric with one model call and writes no run', async () => {
    const before = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    const response = await postJson(url, '/criteria', {
      pipeline: 'tiny',
      goal: '# Goal\n\nMake a thing.',
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({
      data: {
        pipeline: 'tiny',
        criteria: [{ id: 'c1', kind: 'must', statement: 'has text' }],
        diagnostic: null,
        llm: { enabled: true, model: 'test-model', reason: null },
      },
    });
    const after = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    expect(after).toBe(before);
    expect((await postJson(url, '/criteria', { pipeline: 'nope', goal: 'g' })).status).toBe(404);
    expect((await postJson(url, '/criteria', { pipeline: 'tiny', goal: '' })).status).toBe(400);
  });

  it('[QL-20] without a model, POST /criteria answers 503 with the reason and never invents a rubric', async () => {
    const dark = await bootApp([[QUALITY_LOOP_LLM, disabledLlm()], tinyOnly()]);
    try {
      const darkUrl = dark.url;
      const response = await postJson(darkUrl, '/criteria', { pipeline: 'tiny', goal: 'g' });
      expect(response.status).toBe(503);
      expect((await response.json()) as unknown).toMatchObject({
        llm: { enabled: false },
        diagnostic: { stage: 'criteria', reason: 'llm-disabled' },
      });
      expect((await (await fetch(`${darkUrl}/health`)).json()) as unknown).toMatchObject({
        status: 'ok',
        llm: { enabled: false },
      });
    } finally {
      await dark.app.close();
    }
  });

  // Last: booting another app sweeps every `running` row, so it must never overlap a live run.
  it('[QL-13] a run left running by a previous process is failed at boot', async () => {
    const fork = em.fork();
    fork.create(QualityRun, {
      id: 'stale-quality',
      pipeline: 'tiny',
      pipelineVersion: tinyPipeline().version,
      llm: { enabled: true, model: 'test-model', reason: null },
      request: { goal: 'g', outputProvided: false, criteriaProvided: false, maxIterations: 1 },
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
