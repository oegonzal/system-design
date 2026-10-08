import { EntityManager } from '@mikro-orm/postgresql';
import type { INestApplication } from '@nestjs/common';
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
import { type RunRecord, toRunDto } from '../../core/contracts';
import { progressOf } from '../../core/loop/progress';
import type { RunRepository } from '../../core/ports';
import { gatedLlm, tinyPipeline } from '../../core/testing';
import { bootApp, type Envelope, getJson, type Page, postJson } from '../http/testing';
import { RunJanitor } from '../janitor/run-janitor';
import { readSnapshot } from './persistence/snapshot';
import { fullIteration, fullRecord, fullTrace } from './persistence/testing';
import { RunsService } from './runs.service';
import {
  boot,
  CALLS_IN_ITERATION_1,
  canned,
  DUMP_DIR,
  HOURS,
  pollUntil,
  revisingModel,
  TABLES,
  tinyOnly,
} from './runs.testing';
import { QUALITY_LOOP_LLM, RUN_REPOSITORY } from './tokens';

describe('a run’s liveness: heartbeats, recorded iterations and the close', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;

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
    const lastBeat = new Date(Date.now() - 2 * HOURS);
    header('stale-quality', lastBeat);
    header('live-quality', new Date());
    await fork.flush();

    const third = await boot();
    try {
      const read = async (id: string) =>
        (await getJson<Envelope<QualityRunDto>>(third.url, `/runs/${id}`)).data;
      // The sweep writes the finish; the last beat stays what it was — the
      // honest sign of when the process that owned the run was last seen.
      expect(await read('stale-quality')).toMatchObject({
        status: 'failed',
        trace: null,
        error: { name: 'Interrupted', stack: null },
        finishedAt: expect.any(String),
        heartbeatAt: lastBeat.toISOString(),
      });
      const live = await read('live-quality');
      expect(live).toMatchObject({ status: 'running', error: null });
      expect(Date.parse(live.heartbeatAt)).toBeGreaterThanOrEqual(Date.parse(live.startedAt) - 1);
      const listed = (await getJson<Page<QualityRunSummaryDto>>(third.url, '/runs')).data;
      expect(listed.find((row) => row.runId === 'stale-quality')?.heartbeatAt).toBe(
        lastBeat.toISOString(),
      );

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
