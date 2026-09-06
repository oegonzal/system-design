import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { QualityRunDto } from '@sysdesign/contracts';
import { fakeLlm, result, tinyPipeline } from '../../core/testing';

// A directory of this file's own, so the assertions never see another suite's dump.
const DUMP_DIR = join(tmpdir(), `sysdesign-quality-loop-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { PIPELINES_TOKEN, QUALITY_LOOP_LLM } = await import('./tokens');

type Envelope<T> = { data: T };

describe('the HTTP surface', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
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
    app = configureApp(moduleRef.createNestApplication());
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
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

    let record: QualityRunDto | null = null;
    for (let attempt = 0; attempt < 50 && record?.status !== 'complete'; attempt++) {
      record = (
        (await (await fetch(`${url}/runs/${data.runId}`)).json()) as Envelope<QualityRunDto>
      ).data;
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

    const runDir = join(DUMP_DIR, data.runId);
    expect(existsSync(join(runDir, 'manifest.json'))).toBe(true);
    expect(readFileSync(join(runDir, '01-goal.md'), 'utf8')).toBe('# Goal\n\nMake a thing.\n');
    expect(readFileSync(join(DUMP_DIR, 'index.jsonl'), 'utf8')).toContain(data.runId);
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
});
