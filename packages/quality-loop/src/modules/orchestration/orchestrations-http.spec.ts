import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  OrchestrationRunDto,
  QualityRunDto,
  QualityRunSummaryDto,
  RouteReportDto,
} from '@sysdesign/contracts';
import {
  OrchestrationRun,
  OrchestrationRunChild,
  QualityRun,
  truncateTestTables,
} from '@sysdesign/db';
import { DisabledEmbeddingClient } from '@sysdesign/llm';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { GOAL } from '../../orchestrators/memory/testing';
import {
  bootApp,
  claimDumpDir,
  getJson,
  postJson,
  type Envelope,
  type Page,
} from '../http/testing';
import { InMemoryMemoryStore } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import type { OrchestrationRunRepository } from './ports';
import { CANNED, settledOrchestration } from './testing';
import { ORCHESTRATION_RUN_REPOSITORY } from './tokens';

const DUMP_DIR = claimDumpDir('orchestration-http');
const TABLES = [OrchestrationRunChild, OrchestrationRun, QualityRun];

/** What the fake answers the brief classifier with: the schema is locked to the registered routes. */
const ROUTE = { pipeline: 'system-design', rationale: 'a system to design' };

/** Without embeddings: the memory steps are honest about why they skipped, the target still runs. */
const boot = () =>
  bootApp([
    [QUALITY_LOOP_LLM, fakeLlm(...CANNED, ROUTE)],
    [EMBEDDING_CLIENT, new DisabledEmbeddingClient('no-key')],
    [MEMORY_STORE, new InMemoryMemoryStore(null)],
  ]);

describe('the orchestrations HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  let targetRunId: string | null = null;

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

  const settle = (id: string) => settledOrchestration(url, id);

  it('[QL-16] without embeddings the target still completes and every memory step says why it did not run', async () => {
    const started = await postJson(url, '/orchestrations/memory', {
      pipeline: 'system-design',
      goal: GOAL,
      maxIterations: 2,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);

    expect(record.status).toBe('complete');
    // The reason is the injected client's own, whatever the developer's `.env` holds.
    expect(record.context['embedding']).toEqual({ enabled: false, model: null, reason: 'no-key' });
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
    const empty = await postJson(url, '/orchestrations/memory', {});
    expect(empty.status).toBe(400);
    const issues = ((await empty.json()) as { issues: { path: string }[] }).issues.map(
      (i) => i.path,
    );
    // The edge no longer demands a pipeline: whether one is named is the orchestrator's declaration.
    expect(issues).toEqual(['goal']);
    const unnamed = await postJson(url, '/orchestrations/memory', { goal: GOAL });
    expect(unnamed.status).toBe(400);
    expect(((await unnamed.json()) as { message: string }).message).toMatch(/takes a target/);
    expect(
      (
        await postJson(url, '/orchestrations/memory', {
          pipeline: 'system-design',
          goal: GOAL,
          samples: 9,
        })
      ).status,
    ).toBe(400);
    expect(
      (await postJson(url, '/orchestrations/memory', { pipeline: 'nope', goal: GOAL })).status,
    ).toBe(404);
    expect(
      (await postJson(url, '/orchestrations/memory', { pipeline: 'memory-recall', goal: GOAL }))
        .status,
    ).toBe(400);
    expect(
      (await postJson(url, '/orchestrations/memory', { pipeline: 'experience-digest', goal: GOAL }))
        .status,
    ).toBe(400);
    expect(
      (await postJson(url, '/orchestrations/nope', { pipeline: 'system-design', goal: GOAL }))
        .status,
    ).toBe(404);
    expect((await postJson(url, '/orchestrations/memory/from-run', { runId: 'nope' })).status).toBe(
      404,
    );
    expect((await fetch(`${url}/orchestrations/not-a-uuid`)).status).toBe(404);
    expect((await postJson(url, '/memory/not-a-uuid/reindex', {})).status).toBe(404);
  });

  it('[QL-16] starts from an already persisted run through the same ledger, with recall and target provided', async () => {
    const started = await postJson(url, '/orchestrations/memory/from-run', { runId: targetRunId });
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

      adoptedFrom: null,
      maxIterations: 2,
    });
    expect(record.steps['digest']).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
    });
  });

  it('[QL-63] an orchestration and every run it opens carry who opened it, one filter lists them, and a start from one of its runs keeps it', async () => {
    const openedBy = { kind: 'browser-session', id: 'session-orch', label: 'step 3 · form page' };
    const started = await postJson(url, '/orchestrations/calibration', {
      pipeline: 'system-design',
      goal: GOAL,
      samples: 2,
      maxIterations: 1,
      openedBy,
    });
    expect(started.status).toBe(202);
    const record = await settle(
      ((await started.json()) as Envelope<{ orchestrationRunId: string }>).data.orchestrationRunId,
    );
    expect(record.openedBy).toEqual(openedBy);
    const children = record.steps['panel']?.runIds ?? [];
    expect(children).toHaveLength(2);
    for (const childId of children) {
      const child = await getJson<Envelope<QualityRunDto>>(url, `/runs/${childId}`);
      expect(child.data.openedBy).toEqual(openedBy);
    }

    const mine = await getJson<Page<OrchestrationRunDto>>(
      url,
      '/orchestrations?openedBy=session-orch',
    );
    expect(mine.data.map((row) => row.orchestrationRunId)).toEqual([record.orchestrationRunId]);
    const runs = await getJson<Page<QualityRunSummaryDto>>(url, '/runs?openedBy=session-orch');
    expect(runs.data.map((row) => row.runId).sort()).toEqual([...children].sort());
    expect((await fetch(`${url}/orchestrations?openedBy=`)).status).toBe(400);
    // A record whose caller named nobody says so.
    expect(
      (await getJson<Page<OrchestrationRunDto>>(url, '/orchestrations')).data.some(
        (row) => row.openedBy === null,
      ),
    ).toBe(true);

    // Started from one of its runs — standing in for a step (memory) or only seeding the request
    // (calibration) — the record is opened by whoever opened that run.
    const fromRuns: [string, Record<string, unknown>][] = [
      ['/orchestrations/memory/from-run', { runId: children[0] }],
      ['/orchestrations/calibration/from-run', { runId: children[0], samples: 2 }],
    ];
    for (const [path, body] of fromRuns) {
      const again = await postJson(url, path, body);
      expect(again.status).toBe(202);
      const fromRun = await settle(
        ((await again.json()) as Envelope<{ orchestrationRunId: string }>).data.orchestrationRunId,
      );
      expect(fromRun.openedBy).toEqual(openedBy);
    }
  });

  it('[QL-19] the router refuses a named pipeline, reports the judge it would pick, and judges once with it', async () => {
    const named = await postJson(url, '/orchestrations/router', {
      pipeline: 'system-design',
      goal: GOAL,
    });
    expect(named.status).toBe(400);
    expect(((await named.json()) as { message: string }).message).toMatch(/chooses its own/);

    const report = await postJson(url, '/router/report', { goal: GOAL });
    expect(report.status).toBe(200);
    expect(((await report.json()) as Envelope<RouteReportDto>).data).toEqual({
      routes: [
        { id: 'system-design', description: expect.any(String) },
        { id: 'agentic-design', description: expect.any(String) },
      ],
      pipeline: 'system-design',
      rationale: 'a system to design',
    });

    const started = await postJson(url, '/orchestrations/router', { goal: GOAL });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settle(data.orchestrationRunId);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.request).toEqual({
      goal: GOAL,
      outputProvided: false,
      criteriaProvided: false,

      adoptedFrom: null,
      maxIterations: 1,
      samples: null,
    });
    expect(record.context).toEqual({
      classifier: { model: 'test-model' },
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
    const calibration = await postJson(url, '/orchestrations/calibration', {
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

    const second = await postJson(url, '/orchestrations/second-opinion/from-run', {
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

      adoptedFrom: null,
      maxIterations: 1,
    });
  });

  it('[QL-16] a run whose heartbeat went stale is failed at boot with its steps interrupted, a live one is left alone, and the owner’s late close reclaims the swept one', async () => {
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
    const header = (heartbeatAt: Date) =>
      fork.create(OrchestrationRun, {
        id: crypto.randomUUID(),
        orchestrator: 'memory',
        pipeline: 'system-design',
        status: 'running',
        request: {
          goal: GOAL,
          outputProvided: false,
          criteriaProvided: false,

          adoptedFrom: null,
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
        heartbeatAt,
      });
    const stale = header(new Date(Date.now() - 2 * 60 * 60 * 1000));
    const live = header(new Date());
    await fork.flush();

    const second = await boot();
    try {
      const read = async (id: string) =>
        (
          (await (
            await fetch(`${second.url}/orchestrations/${id}`)
          ).json()) as Envelope<OrchestrationRunDto>
        ).data;
      const swept = await read(stale.id);
      expect(swept.status).toBe('failed');
      expect(swept.error?.name).toBe('Interrupted');
      expect(swept.steps['recall'].status).toBe('complete');
      expect(swept.steps['target']).toMatchObject({ status: 'failed', reason: 'interrupted' });
      expect(swept.steps['digest']).toMatchObject({ status: 'skipped', reason: 'interrupted' });
      expect(swept.steps['store']).toMatchObject({ status: 'skipped', reason: 'interrupted' });
      expect((await read(live.id)).status).toBe('running');

      // A late flush from the owner never resurrects a swept row …
      const repository = second.app.get<OrchestrationRunRepository>(ORCHESTRATION_RUN_REPOSITORY);
      await repository.update({
        ...swept,
        steps: { ...swept.steps, target: { ...swept.steps['target'], status: 'running' } },
      });
      expect((await read(stale.id)).status).toBe('failed');
      // … but its close does: the owner knows how the run actually ended.
      const outcome = await repository.close({
        ...swept,
        status: 'complete',
        error: null,
        steps: {
          ...swept.steps,
          target: { ...swept.steps['target'], status: 'complete', reason: null },
        },
      });
      expect(outcome).toBe('reclaimed');
      const after = await read(stale.id);
      expect(after.status).toBe('complete');
      expect(after.error).toBeNull();
      expect(after.steps['target'].status).toBe('complete');
      // And a terminal row is never written again.
      expect(await repository.close({ ...after, status: 'failed' })).toBe('refused');
      expect((await read(stale.id)).status).toBe('complete');
    } finally {
      await second.app.close();
    }
  });
});
