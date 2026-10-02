import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { QualityRunDto, QualityRunSummaryDto, RunTrace } from '@sysdesign/contracts';
import {
  QualityRun,
  QualityRunCriterion,
  QualityRunCriterionResult,
  QualityRunFinding,
  QualityRunIteration,
  truncateTestTables,
} from '@sysdesign/db';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { criterionLengthBound, toRunDto, type RunRecord } from '../../core/contracts';
import { progressOf } from '../../core/loop/progress';
import type { RunRepository } from '../../core/ports';
import { fakeLlm, gatedLlm, result, sequencedLlm, tinyPipeline } from '../../core/testing';
import {
  bootApp,
  claimDumpDir,
  getJson,
  postJson,
  type Envelope,
  type Page,
} from '../http/testing';
import { RunJanitor } from '../janitor/run-janitor';
import { readSnapshot } from './persistence/snapshot';
import { RunsService } from './runs.service';
import { fullIteration, fullRecord, fullTrace } from './persistence/testing';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, RUN_REPOSITORY } from './tokens';

const DUMP_DIR = claimDumpDir('quality-loop');
const TABLES = [QualityRun];

const tinyOnly = () => [PIPELINES_TOKEN, new Map([['tiny', tinyPipeline()]])] as const;

/** The fake model every boot here answers with: a rubric, an artifact, no findings, one pass. */
const canned = () =>
  fakeLlm(
    { criteria: [{ kind: 'must', statement: 'has text' }] },
    { text: 'made', parts: ['one'] },
    { findings: [] },
    {
      results: [result({ criterionId: 'c1', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
  );

/** The real module over real HTTP; a fresh instance shares nothing but the database. */
const boot = () => bootApp([[QUALITY_LOOP_LLM, canned()], tinyOnly()]);

/**
 * A model whose iteration 1 judges c1 partial and revises, and whose
 * iteration 2 passes it. Gated after `CALLS_IN_ITERATION_1`, it holds a run
 * in flight with one iteration recorded.
 */
const revisingModel = () =>
  sequencedLlm(
    { criteria: [{ kind: 'must', statement: 'has text' }] },
    { text: 'made', parts: ['one'] },
    { findings: [] },
    {
      results: [result({ criterionId: 'c1', result: 'partial', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
    {
      results: [result({ criterionId: 'c1', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
  );
const CALLS_IN_ITERATION_1 = 4; // criteria, producer, critic, evaluator

/** Read until `done` holds — a fake model moves within a second; the last read is returned either way. */
const pollUntil = async <T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> => {
  let value = await read();
  for (let attempt = 0; attempt < 100 && !done(value); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    value = await read();
  }
  return value;
};

const HOURS = 60 * 60 * 1000;

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
    ({ app, url } = await boot());
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
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
      llm: { model: 'test-model' },
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
      attempt: 1,
      errorName: null,
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
      llm: { model: 'test-model' },
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
      // Within the edge's cap, past the pipeline's own bound: the service's 400, same path.
      [
        {
          id: 'c1',
          kind: 'must',
          statement: 'x'.repeat(criterionLengthBound(tinyPipeline().task) + 1),
        },
      ],
    ]) {
      const response = await postJson(url, '/runs', { pipeline: 'tiny', goal: 'g', criteria });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { issues: { path: string }[] };
      expect(body.issues[0].path).toBe('criteria');
    }
    const after = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    expect(after).toBe(before);
  });

  it('[QL-23] POST /runs adopts a recorded iteration of an earlier run — same pipeline version, equal rubric — and refuses anything else with 400', async () => {
    // The fake judges `c1`, so a rubric under that id is assessed and accepted.
    const rubric = [{ id: 'c1', kind: 'must', statement: 'has text' }];
    const first = await postJson(url, '/runs', {
      pipeline: 'tiny',
      goal: '# Goal',
      criteria: rubric,
    });
    const earlier = await settledRun(
      ((await first.json()) as Envelope<{ runId: string }>).data.runId,
    );

    const started = await postJson(url, '/runs', {
      pipeline: 'tiny',
      goal: '# Goal',
      criteria: rubric,
      adopt: { runId: earlier.runId, iteration: 1 },
      maxIterations: 2,
    });
    expect(started.status).toBe(202);
    const { runId: adopting } = ((await started.json()) as Envelope<{ runId: string }>).data;
    const run = await settledRun(adopting);
    expect(run.request).toMatchObject({
      outputProvided: false,
      criteriaProvided: true,
      adoptedFrom: { runId: earlier.runId, iteration: 1 },
    });
    expect(run.trace?.iterations[0]).toEqual({
      ...earlier.trace?.iterations[0],
      iteration: 1,
      mode: 'adopted',
    });
    // The loop went on from the recorded decision — an accept, so it stopped
    // there — and asked the model nothing at all.
    expect(earlier.trace?.finalDecision).toBe('accept');
    expect(run.trace?.iterations).toHaveLength(1);
    expect(run.trace?.stopReason).toBe('accepted');
    expect(run.exchanges).toEqual([]);
    const manifest = JSON.parse(
      readFileSync(join(DUMP_DIR, adopting, 'manifest.json'), 'utf8'),
    ) as { adoptedFrom: unknown };
    expect(manifest.adoptedFrom).toEqual({ runId: earlier.runId, iteration: 1 });

    const before = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    const refused: [string, unknown][] = [
      [
        'adopt',
        { adopt: { runId: earlier.runId, iteration: 1 }, output: { text: 'x', parts: [] } },
      ],
      ['criteria', { adopt: { runId: earlier.runId, iteration: 1 } }],
      ['adopt', { criteria: rubric, adopt: { runId: 'no-such-run', iteration: 1 } }],
      ['adopt', { criteria: rubric, adopt: { runId: earlier.runId, iteration: 9 } }],
      [
        'criteria',
        {
          criteria: [{ id: 'c1', kind: 'must', statement: 'has other text' }],
          adopt: { runId: earlier.runId, iteration: 1 },
        },
      ],
    ];
    for (const [path, body] of refused) {
      const answer = await postJson(url, '/runs', {
        pipeline: 'tiny',
        goal: '# Goal',
        ...(body as object),
      });
      expect(answer.status).toBe(400);
      const { issues } = (await answer.json()) as { issues: { path: string }[] };
      expect(issues[0].path).toBe(path);
    }
    expect(((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total).toBe(before);
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
        llm: { model: 'test-model' },
      },
    });
    const after = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    expect(after).toBe(before);
    expect((await postJson(url, '/criteria', { pipeline: 'nope', goal: 'g' })).status).toBe(404);
    expect((await postJson(url, '/criteria', { pipeline: 'tiny', goal: '' })).status).toBe(400);
  });

  it('[QL-20] a derivation the model fails answers 503 with the diagnostic and never an empty rubric', async () => {
    // A model with no answers: every call is a schema miss.
    const dark = await bootApp([[QUALITY_LOOP_LLM, fakeLlm()], tinyOnly()]);
    try {
      const darkUrl = dark.url;
      const before = ((await (await fetch(`${darkUrl}/runs`)).json()) as Page<unknown>).meta.total;
      const response = await postJson(darkUrl, '/criteria', { pipeline: 'tiny', goal: 'g' });
      expect(response.status).toBe(503);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        llm: { model: 'test-model' },
        diagnostic: { stage: 'criteria', reason: 'llm-failed' },
      });
      expect(body).not.toHaveProperty('criteria');
      expect(((await (await fetch(`${darkUrl}/runs`)).json()) as Page<unknown>).meta.total).toBe(
        before,
      );
    } finally {
      await dark.app.close();
    }
  });

  it('[QL-13] a run whose heartbeat went stale is failed at boot; one still heartbeating is left alone', async () => {
    const fork = em.fork();
    const header = (id: string, heartbeatAt: Date) =>
      fork.create(QualityRun, {
        id,
        pipeline: 'tiny',
        pipelineVersion: tinyPipeline().version,
        llm: { model: 'test-model' },
        request: {
          goal: 'g',
          outputProvided: false,
          criteriaProvided: false,
          adoptedFrom: null,
          maxIterations: 1,
        },
        git: { branch: '', headSha: '' },
        startedAt: new Date(),
        heartbeatAt,
      });
    header('stale-quality', new Date(Date.now() - 2 * HOURS));
    header('live-quality', new Date());
    await fork.flush();

    const third = await boot();
    try {
      const read = async (id: string) =>
        (await getJson<Envelope<QualityRunDto>>(third.url, `/runs/${id}`)).data;
      expect(await read('stale-quality')).toMatchObject({
        status: 'failed',
        trace: null,
        error: { name: 'Interrupted', stack: null },
        finishedAt: expect.any(String),
      });
      expect(await read('live-quality')).toMatchObject({ status: 'running', error: null });

      // The janitor sweeps again on its interval; asked by hand, it fails what went stale since.
      await fork.nativeUpdate(
        QualityRun,
        { id: 'live-quality' },
        { heartbeatAt: new Date(Date.now() - 2 * HOURS) },
      );
      expect(await third.app.get(RunJanitor).sweep()).toEqual({ runs: 1, orchestrations: 0 });
      expect((await read('live-quality')).status).toBe('failed');
    } finally {
      await third.app.close();
    }
  });

  it('[QL-13] a second instance leaves a live run alone, and the owner’s late close reclaims a swept row with the truth (ENG-10)', async () => {
    // The owner's model waits at the gate, so its run stays in flight for as long as this spec needs.
    const gated = gatedLlm(canned());
    const owner = await bootApp([[QUALITY_LOOP_LLM, gated], tinyOnly()]);
    try {
      const started = await postJson(owner.url, '/runs', { pipeline: 'tiny', goal: '# Goal' });
      expect(started.status).toBe(202);
      const { runId: id } = ((await started.json()) as Envelope<{ runId: string }>).data;

      const other = await boot();
      try {
        const read = async () =>
          (await getJson<Envelope<QualityRunDto>>(other.url, `/runs/${id}`)).data;
        // Booting beside a live run fails nothing: the row's heartbeat is fresh.
        expect((await read()).status).toBe('running');

        // Once the heartbeat is stale, the sweep calls the run dead.
        await em
          .fork()
          .nativeUpdate(QualityRun, { id }, { heartbeatAt: new Date(Date.now() - 2 * HOURS) });
        await other.app.get(RunJanitor).sweep();
        expect(await read()).toMatchObject({
          status: 'failed',
          error: { name: 'Interrupted' },
          trace: null,
        });

        // The owner was alive all along; when it finishes, the truth overwrites the sweep.
        gated.release();
        let run = await read();
        for (let attempt = 0; attempt < 100 && run.status !== 'complete'; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          run = await read();
        }
        expect(run).toMatchObject({
          status: 'complete',
          error: null,
          finishedAt: expect.any(String),
        });
        expect(run.trace?.iterations).toHaveLength(1);
        const rows = await em.fork().find(QualityRunIteration, { run: id });
        expect(rows).toHaveLength(1);

        // A row that is terminal is never written again — a second close inserts nothing.
        const repository = owner.app.get<RunRepository>(RUN_REPOSITORY);
        const again = await repository.close({
          ...run,
          exchanges: [],
          git: { branch: 'spec', headSha: 'spec' },
        });
        expect(again).toBe('refused');
        expect(await em.fork().find(QualityRunIteration, { run: id })).toHaveLength(1);
      } finally {
        await other.app.close();
      }
    } finally {
      await owner.app.close();
    }
  });

  it('[QL-13] a running run records each iteration as it lands, GET /runs/:id shows them with no stop reason, and its close replaces them with the whole run', async () => {
    // Iteration 1 judges c1 partial and revises; the model then waits at the
    // gate before the revision, holding the run in flight after one iteration.
    const gated = gatedLlm(revisingModel(), CALLS_IN_ITERATION_1);
    const owner = await bootApp([[QUALITY_LOOP_LLM, gated], tinyOnly()]);
    try {
      const started = await postJson(owner.url, '/runs', {
        pipeline: 'tiny',
        goal: '# Goal',
        maxIterations: 2,
      });
      const { runId: id } = ((await started.json()) as Envelope<{ runId: string }>).data;
      const listed = async () =>
        (await getJson<Page<QualityRunSummaryDto>>(owner.url, '/runs')).data.find(
          (row) => row.runId === id,
        );

      let row = await listed();
      for (let attempt = 0; attempt < 100 && row?.iterations !== 1; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        row = await listed();
      }
      expect(row).toMatchObject({ status: 'running', iterations: 1, criteria: 1, overall: null });
      const [first] = await em.fork().find(QualityRunIteration, { run: id });
      expect(first).toMatchObject({ iteration: 1, mode: 'initial' });
      expect(first.decision.finalDecision).toBe('revise');

      // [QL-12] The wire carries the run so far: the finished iteration and the
      // loop's standing after it, with no stop reason while the run is running.
      const live = (await getJson<Envelope<QualityRunDto>>(owner.url, `/runs/${id}`)).data;
      expect(live).toMatchObject({ status: 'running', finishedAt: null });
      expect(live.trace).toMatchObject({
        pipeline: { id: 'tiny' },
        contract: { goal: '# Goal', criteria: [{ id: 'c1', kind: 'must', statement: 'has text' }] },
        bestIteration: 1,
        finalDecision: 'revise',
        stopReason: null,
        lessons: [],
      });
      expect(live.trace?.iterations.map((iteration) => iteration.mode)).toEqual(['initial']);
      expect(live.trace?.iterations[0]?.rendered).toBe('[text] made\n[part.1] one');

      gated.release();
      let run = (await getJson<Envelope<QualityRunDto>>(owner.url, `/runs/${id}`)).data;
      for (let attempt = 0; attempt < 100 && run.status !== 'complete'; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        run = (await getJson<Envelope<QualityRunDto>>(owner.url, `/runs/${id}`)).data;
      }
      expect(run.trace?.iterations.map((iteration) => iteration.mode)).toEqual([
        'initial',
        'revise',
      ]);
      expect(run.trace?.stopReason).not.toBeNull();
      // One snapshot of rows: the close replaced the progress, never added to it.
      const fork = em.fork();
      expect(await fork.find(QualityRunIteration, { run: id })).toHaveLength(2);
      expect(await fork.find(QualityRunCriterion, { run: id })).toHaveLength(1);
      expect(await fork.find(QualityRunCriterionResult, { run: id })).toHaveLength(2);
    } finally {
      await owner.app.close();
    }
  });
  it('[QL-13] iterations a run recorded are final: a run that throws after one fails with it kept, so a grade already shown never disappears', async () => {
    const gated = gatedLlm(revisingModel(), CALLS_IN_ITERATION_1);
    const owner = await bootApp([[QUALITY_LOOP_LLM, gated], tinyOnly()]);
    try {
      const started = await postJson(owner.url, '/runs', {
        pipeline: 'tiny',
        goal: '# Goal',
        maxIterations: 2,
      });
      const { runId: id } = ((await started.json()) as Envelope<{ runId: string }>).data;
      const read = async () =>
        (await getJson<Envelope<QualityRunDto>>(owner.url, `/runs/${id}`)).data;
      const live = await pollUntil(read, (run) => run.trace?.iterations.length === 1);
      expect(live.status).toBe('running');

      // The model dies before iteration 2: the loop throws, and the run fails.
      gated.fail(new Error('the model went away'));
      const run = await pollUntil(read, (current) => current.status !== 'running');
      expect(run).toMatchObject({
        status: 'failed',
        finishedAt: expect.any(String),
        error: { message: 'the model went away' },
      });
      // What it recorded stands, with its standing and no stop reason — the loop never chose one.
      expect(run.trace).toEqual(live.trace);
      expect(run.trace).toMatchObject({
        pipeline: { id: 'tiny', version: tinyPipeline().version },
        bestIteration: 1,
        finalDecision: 'revise',
        stopReason: null,
      });
      expect(await em.fork().find(QualityRunIteration, { run: id })).toHaveLength(1);

      // [QL-23] Final, so adoptable: a later run takes it as its iteration 1, verbatim.
      const adopting = await postJson(url, '/runs', {
        pipeline: 'tiny',
        goal: '# Goal',
        criteria: run.trace?.contract.criteria,
        adopt: { runId: id, iteration: 1 },
        maxIterations: 1,
      });
      expect(adopting.status).toBe(202);
      const adopted = await settledRun(
        ((await adopting.json()) as Envelope<{ runId: string }>).data.runId,
      );
      expect(adopted.trace?.iterations).toEqual([
        { ...run.trace?.iterations[0], iteration: 1, mode: 'adopted' },
      ]);
    } finally {
      await owner.app.close();
    }
  });

  it('[QL-13] a run that throws after recording an iteration keeps it in memory and in its dump, with its standing and no stop reason', async () => {
    const gated = gatedLlm(revisingModel(), CALLS_IN_ITERATION_1);
    const owner = await bootApp([[QUALITY_LOOP_LLM, gated], tinyOnly()]);
    try {
      let held: RunRecord | null = null;
      const running = owner.app
        .get(RunsService)
        .execute({ pipeline: 'tiny', goal: '# Goal', maxIterations: 2 }, (opened) => {
          held = opened;
        });
      // The record an orchestration reads in memory carries the progress the row does.
      const live = await pollUntil(
        () => Promise.resolve(held === null ? null : toRunDto(held)),
        (run) => run?.trace?.iterations.length === 1,
      );
      expect(live).toMatchObject({
        status: 'running',
        trace: { bestIteration: 1, finalDecision: 'revise', stopReason: null },
      });

      // The model dies before iteration 2: the loop throws, and the run fails.
      gated.fail(new Error('the model went away'));
      const record = await running;
      expect(record).toMatchObject({ status: 'failed', error: { message: 'the model went away' } });
      expect(record.trace).toEqual(live?.trace);
      // The row agrees, and its header claims no verdict the loop never reached.
      const stored = await getJson<Envelope<QualityRunDto>>(owner.url, `/runs/${record.runId}`);
      expect(stored.data.trace).toEqual(record.trace);
      const listed = await getJson<Page<QualityRunSummaryDto>>(owner.url, '/runs?status=failed');
      expect(listed.data.find((run) => run.runId === record.runId)).toMatchObject({
        iterations: 1,
        finalDecision: null,
        stopReason: null,
        overall: null,
      });

      // The dump is the audit trail: what was recorded is in it.
      const runDir = join(DUMP_DIR, record.runId);
      const manifest = JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      expect(manifest).toMatchObject({
        status: 'failed',
        iterations: 1,
        bestIteration: 1,
        finalDecision: 'revise',
        stopReason: null,
      });
      expect(existsSync(join(runDir, '04-iterations/01/decision.json'))).toBe(true);
      expect(readFileSync(join(runDir, 'run.md'), 'utf8')).toContain(
        '**revise** (failed, no stop reason)',
      );
    } finally {
      await owner.app.close();
    }
  });

  it('[QL-13] the repository writes a close with no trace and the janitor’s sweep as the header alone: the recorded iterations stand', async () => {
    const repository = app.get<RunRepository>(RUN_REPOSITORY);
    const trace = fullTrace({
      iterations: [fullIteration(), fullIteration({ iteration: 2, mode: 'revise' })],
    });
    const progress = progressOf(trace, trace.iterations);
    if (progress === null) throw new Error('two iterations stand somewhere');
    const running = (runId: string): RunRecord =>
      fullRecord({ runId, status: 'running', finishedAt: null, trace: null, exchanges: [] });
    const threw = (runId: string): RunRecord => ({
      ...running(runId),
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: { name: 'Error', message: 'the model went away', stack: null },
    });
    const recorded = async (runId: string) => {
      await repository.open(running(runId), trace.pipeline.version);
      await repository.recordProgress(runId, progress);
    };

    // The loop threw: its close carries no trace, and replaces nothing.
    await recorded('threw-quality');
    expect(await repository.close(threw('threw-quality'))).toBe('closed');
    const failed = await repository.find('threw-quality');
    expect(failed).toMatchObject({ status: 'failed', error: { message: 'the model went away' } });
    expect(failed?.trace).toEqual(progress);

    // Nor does a close carrying the progress the run last published — what the
    // service hands it — since progress settles nothing.
    await recorded('threw-with-progress');
    expect(await repository.close({ ...threw('threw-with-progress'), trace: progress })).toBe(
      'closed',
    );
    expect((await repository.find('threw-with-progress'))?.trace).toEqual(progress);
    const [listed] = await repository.list({ status: 'failed', limit: 50, offset: 0 });
    expect(listed.find((run) => run.runId === 'threw-with-progress')).toMatchObject({
      iterations: 2,
      finalDecision: null,
      stopReason: null,
      overall: null,
    });

    // The janitor fails a stale row's header; the owner's late close then reclaims it, still with no trace.
    await recorded('swept-quality');
    await em
      .fork()
      .nativeUpdate(
        QualityRun,
        { id: 'swept-quality' },
        { heartbeatAt: new Date(Date.now() - 2 * HOURS) },
      );
    await repository.failStale(new Date(Date.now() - HOURS));
    const swept = await repository.find('swept-quality');
    expect(swept).toMatchObject({ status: 'failed', error: { name: 'Interrupted' } });
    expect(swept?.trace).toEqual(progress);
    expect(await repository.close(threw('swept-quality'))).toBe('reclaimed');
    const reclaimed = await repository.find('swept-quality');
    expect(reclaimed).toMatchObject({
      status: 'failed',
      error: { message: 'the model went away' },
    });
    expect(reclaimed?.trace).toEqual(progress);
  });

  it('[QL-13] a run is read as one snapshot: a write landing between its queries is seen by none of them', async () => {
    const repository = app.get<RunRepository>(RUN_REPOSITORY);
    const one = fullTrace();
    const two = fullTrace({
      iterations: [fullIteration(), fullIteration({ iteration: 2, mode: 'revise' })],
    });
    const progress = (trace: RunTrace) => {
      const standing = progressOf(trace, trace.iterations);
      if (standing === null) throw new Error('an iteration stands somewhere');
      return standing;
    };
    const id = 'snapshot-quality';
    await repository.open(
      fullRecord({ runId: id, status: 'running', finishedAt: null, trace: null }),
      one.pipeline.version,
    );
    await repository.recordProgress(id, progress(one));

    const seen = await readSnapshot(em, async (snapshot) => {
      const counts = () =>
        Promise.all([
          snapshot.count(QualityRunIteration, { run: id }),
          snapshot.count(QualityRunFinding, { run: id }),
        ]);
      const before = await counts();
      // A writer replaces every child row while the read sits between its queries.
      await repository.recordProgress(id, progress(two));
      return { before, after: await counts() };
    });
    expect(seen.after).toEqual(seen.before);
    expect(seen.before).toEqual([1, 2]);
    // Outside that snapshot the write is there, read whole.
    expect((await repository.find(id))?.trace).toEqual(progress(two));
  });
});
