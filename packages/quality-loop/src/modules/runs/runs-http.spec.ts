import { EntityManager } from '@mikro-orm/postgresql';
import type { INestApplication } from '@nestjs/common';
import {
  RUN_OPENER_ID_MAX_LENGTH,
  type QualityRunDto,
  type QualityRunSummaryDto,
} from '@sysdesign/contracts';
import {
  QualityRunCriterion,
  QualityRunCriterionResult,
  QualityRunFinding,
  QualityRunIteration,
  truncateTestTables,
} from '@sysdesign/db';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_MISS } from '@sysdesign/llm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criterionLengthBound, providedStatementLimit } from '../../core/contracts';
import { fakeLlm, tinyPipeline } from '../../core/testing';
import { bootApp, type Envelope, getJson, type Page, postJson } from '../http/testing';
import { boot, DUMP_DIR, TABLES, tinyOnly } from './runs.testing';
import { QUALITY_LOOP_LLM } from './tokens';

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
      overruns: 0,
      overCeiling: 0,
      cut: 0,
      trimmed: 0,
      salvagedFrom: 'result',
      feedback: false,
      apiCalls: 1,
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
    // The pace is the janitor's own, as the suite booted it: the production threshold.
    expect((await (await fetch(`${url}/health`)).json()) as unknown).toEqual({
      status: 'ok',
      llm: { model: 'test-model' },
      heartbeat: { heartbeatEveryMs: 60_000, staleAfterMs: 180_000 },
    });
  });

  it('[QL-63] records who opened a run, lists it under that opener alone, and refuses an opener it does not declare', async () => {
    const openedBy = { kind: 'browser-session', id: 'session-http', label: 'step 6 · form page' };
    const started = await postJson(url, '/runs', { pipeline: 'tiny', goal: '# Goal', openedBy });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ runId: string }>;
    expect((await settledRun(data.runId)).openedBy).toEqual(openedBy);
    // A run whose caller named nobody says so.
    expect(record?.openedBy).toBeNull();

    const mine = await getJson<Page<QualityRunSummaryDto>>(url, '/runs?openedBy=session-http');
    expect(mine.data.map((row) => [row.runId, row.openedBy])).toEqual([[data.runId, openedBy]]);
    const others = await getJson<Page<unknown>>(url, '/runs?openedBy=session-other');
    expect(others.meta.total).toBe(0);
    expect((await fetch(`${url}/runs?openedBy=`)).status).toBe(400);

    const before = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    const refused: [string, unknown][] = [
      ['openedBy.kind', { ...openedBy, kind: 'studio' }],
      ['openedBy.id', { ...openedBy, id: '' }],
      ['openedBy.id', { ...openedBy, id: 'x'.repeat(RUN_OPENER_ID_MAX_LENGTH + 1) }],
      ['openedBy', { ...openedBy, step: 6 }],
    ];
    for (const [path, opener] of refused) {
      const answer = await postJson(url, '/runs', {
        pipeline: 'tiny',
        goal: 'g',
        openedBy: opener,
      });
      expect(answer.status).toBe(400);
      const { issues } = (await answer.json()) as { issues: { path: string }[] };
      expect(issues.map((issue) => issue.path)).toEqual([path]);
    }
    expect(((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total).toBe(before);
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

  it('[QL-80] a run may ask for a bar above its pipeline’s, which the record keeps; one under it is refused', async () => {
    const lowered = await postJson(url, '/runs', {
      pipeline: 'tiny',
      goal: '# Goal',
      acceptAt: 50,
    });
    expect(lowered.status).toBe(400);
    expect(((await lowered.json()) as { message: string }).message).toContain('below the pipeline');
    const raised = await postJson(url, '/runs', { pipeline: 'tiny', goal: '# Goal', acceptAt: 95 });
    expect(raised.status).toBe(202);
    const { data } = (await raised.json()) as Envelope<{ runId: string }>;
    const run = await settledRun(data.runId);
    expect(run.request.acceptAt).toBe(95);
    const plain = await postJson(url, '/runs', { pipeline: 'tiny', goal: '# Goal' });
    const other = (await plain.json()) as Envelope<{ runId: string }>;
    expect((await settledRun(other.data.runId)).request.acceptAt).toBeNull();
  });

  it('[QL-79] the verdicts of named iterations are read in one call; an iteration never recorded is left out, and the list is validated', async () => {
    const started = await postJson(url, '/runs', { pipeline: 'tiny', goal: '# Goal' });
    const { data } = (await started.json()) as Envelope<{ runId: string }>;
    const run = await settledRun(data.runId);
    const asked = await postJson(url, '/runs/evidence', {
      iterations: [
        { runId: data.runId, iteration: 1 },
        { runId: data.runId, iteration: 7 },
        { runId: 'never-opened', iteration: 1 },
      ],
    });
    expect(asked.status).toBe(200);
    const { data: evidence } = (await asked.json()) as Envelope<
      { runId: string; iteration: number; finishedAt: string | null; criteria: unknown[] }[]
    >;
    expect(evidence).toEqual([
      {
        runId: data.runId,
        iteration: 1,
        finishedAt: run.finishedAt,
        criteria: run.trace?.iterations[0]?.ledger.criteria,
      },
    ]);
    expect((await postJson(url, '/runs/evidence', { iterations: [] })).status).toBe(400);
    expect((await postJson(url, '/runs/evidence', { runs: ['x'] })).status).toBe(400);
  });

  it('[QL-47] a rubric statement past the ceiling, as long as the deriver can return, is taken back and recorded whole', async () => {
    // The studio hands a derived rubric back on every grade and coach run: a
    // statement the deriver kept past its ceiling must start a run, not a 400.
    const statement = 'y'.repeat(criterionLengthBound(tinyPipeline().task).ceiling + 120);
    expect(statement.length).toBeLessThanOrEqual(providedStatementLimit(tinyPipeline().task));
    const rubric = [{ id: 'c1', kind: 'must', statement }];
    const started = await postJson(url, '/runs', {
      pipeline: 'tiny',
      goal: '# Goal',
      criteria: rubric,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ runId: string }>;
    const run = await settledRun(data.runId);
    expect(run.trace?.contract.criteria).toEqual(rubric);
    const rows = await em.fork().find(QualityRunCriterion, { run: data.runId });
    expect(rows.map((row) => row.statement)).toEqual([statement]);
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
      // Within the edge's cap, past the longest the pipeline's own deriver can return: the service's 400, same path.
      [
        {
          id: 'c1',
          kind: 'must',
          statement: 'x'.repeat(providedStatementLimit(tinyPipeline().task) + 1),
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

  it('[QL-20] POST /criteria derives a rubric with one model call, writes no run, and dumps the derivation as a folder of its own', async () => {
    const before = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    const response = await postJson(url, '/criteria', {
      pipeline: 'tiny',
      goal: '# Goal\n\nMake a thing.',
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { dumpRunId: string } };
    expect(data).toEqual({
      pipeline: 'tiny',
      criteria: [{ id: 'c1', kind: 'must', statement: 'has text' }],
      diagnostic: null,
      llm: { model: 'test-model' },
      dumpRunId: expect.stringMatching(/-criteria$/),
    });
    const after = ((await (await fetch(`${url}/runs`)).json()) as Page<unknown>).meta.total;
    expect(after).toBe(before);
    // The rubric can be read where it was made: the goal, the criteria and the one exchange.
    const dumpDir = join(DUMP_DIR, data.dumpRunId);
    expect(readFileSync(join(dumpDir, '01-goal.md'), 'utf8')).toBe('# Goal\n\nMake a thing.\n');
    expect(JSON.parse(readFileSync(join(dumpDir, '02-criteria.json'), 'utf8'))).toEqual([
      { id: 'c1', kind: 'must', statement: 'has text' },
    ]);
    expect(JSON.parse(readFileSync(join(dumpDir, 'manifest.json'), 'utf8'))).toMatchObject({
      kind: 'criteria',
      pipeline: 'tiny@0.0.1',
      criteria: 1,
      exchangeCount: 1,
    });
    expect(existsSync(join(dumpDir, '05-llm/01.criteria.1.user.txt'))).toBe(true);
    expect(readFileSync(join(DUMP_DIR, 'index.jsonl'), 'utf8')).toContain(data.dumpRunId);
    expect((await postJson(url, '/criteria', { pipeline: 'nope', goal: 'g' })).status).toBe(404);
    expect((await postJson(url, '/criteria', { pipeline: 'tiny', goal: '' })).status).toBe(400);
  });

  it('[QL-20] a derivation the model fails answers 503 with the diagnostic, says what ended the call, and never an empty rubric', async () => {
    // A model with no answers: every call is a schema miss.
    const dark = await bootApp([[QUALITY_LOOP_LLM, fakeLlm()], tinyOnly()]);
    try {
      const darkUrl = dark.url;
      const before = ((await (await fetch(`${darkUrl}/runs`)).json()) as Page<unknown>).meta.total;
      const response = await postJson(darkUrl, '/criteria', { pipeline: 'tiny', goal: 'g' });
      expect(response.status).toBe(503);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        message: `no criteria were derived — llm-failed: ${SCHEMA_MISS}: no canned answer`,
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
});
