import { Logger, type INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { QualityRunDto } from '@sysdesign/contracts';
import { ensureDatabase, QualityRunIteration } from '@sysdesign/db';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fakeLlm, result, tinyPipeline } from '../../core/testing';
import { bootApp, getJson, truncate, type Envelope } from '../http/testing';
import { DumpTraceStore } from './dump-trace-store';
import { RunsService } from './runs.service';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, TRACE_STORE } from './tokens';

const TABLES = ['quality_run'];
const RUBRIC = [{ id: 'c1', kind: 'must', statement: 'has text' }];

/** One pass over a supplied rubric: an artifact, no findings, the criterion met. */
const passing = () =>
  fakeLlm(
    { text: 'made', parts: ['one'] },
    { findings: [] },
    { results: [result({ criterionId: 'c1', locationRefs: ['text'] })], advisoryVerdict: null },
  );

describe('a dump the disk refuses', () => {
  // A dump root that is a file, so no run folder can be created under it.
  const root = mkdtempSync(join(tmpdir(), 'sysdesign-refused-dump-'));
  const blocked = join(root, 'not-a-directory');
  let app: INestApplication;
  let url: string;
  let em: EntityManager;

  beforeAll(async () => {
    writeFileSync(blocked, 'x');
    await ensureDatabase();
    ({ app, url } = await bootApp([
      [QUALITY_LOOP_LLM, passing()],
      [PIPELINES_TOKEN, new Map([['tiny', tinyPipeline()]])],
      [TRACE_STORE, new DumpTraceStore(blocked)],
    ]));
    em = app.get(EntityManager);
    await truncate(em, TABLES);
  });

  afterAll(async () => {
    await truncate(em, TABLES);
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('[QL-13] is logged, and the run still closes its row with the true outcome', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const record = await app
      .get(RunsService)
      .execute({ pipeline: 'tiny', goal: '# Goal', criteria: RUBRIC });
    const messages = logged.mock.calls.map(([message]) => message);
    logged.mockRestore();
    expect(record.status).toBe('complete');
    expect(messages).toContainEqual(expect.stringContaining('dump not written'));

    const row = (await getJson<Envelope<QualityRunDto>>(url, `/runs/${record.runId}`)).data;
    expect(row).toMatchObject({ status: 'complete', error: null, finishedAt: expect.any(String) });
    expect(row.trace?.finalDecision).toBe('accept');
    expect(await em.fork().count(QualityRunIteration, { run: record.runId })).toBe(1);
  });
});
