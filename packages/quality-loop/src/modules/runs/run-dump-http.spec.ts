import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { QualityRunDto, RunDumpEntryDto, RunDumpFileDto } from '@sysdesign/contracts';
import { ensureDatabase, QualityRun, truncateTestTables } from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm, result, tinyPipeline } from '../../core/testing';
import { bootApp, claimDumpDir, getJson, type Envelope } from '../http/testing';
import { RunsService } from './runs.service';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM } from './tokens';

/**
 * The dump route against the real application, which is the only way to prove
 * the two things a unit test cannot: that the route is reachable at all, and
 * that it neither shadows `GET /runs/:id` nor is shadowed by it.
 */

const TABLES = [QualityRun];
const RUBRIC = [{ id: 'c1', kind: 'must', statement: 'has text' }];

const passing = () =>
  fakeLlm(
    { text: 'made', parts: ['one'] },
    { findings: [] },
    { results: [result({ criterionId: 'c1', locationRefs: ['text'] })], advisoryVerdict: null },
  );

describe('reading a run’s dump over HTTP', () => {
  const dumps = claimDumpDir('run-dump-http');
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  let runId: string;

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await bootApp([
      [QUALITY_LOOP_LLM, passing()],
      [PIPELINES_TOKEN, new Map([['tiny', tinyPipeline()]])],
    ]));
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
    const record = await app
      .get(RunsService)
      .execute({ pipeline: 'tiny', goal: '# Goal', criteria: RUBRIC });
    runId = record.runId;
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
    await app.close();
    rmSync(dumps, { recursive: true, force: true });
  });

  it('[QL-31] lists the dump and serves one file, without shadowing the run record', async () => {
    // The record still answers at its own path: the dump is rooted under it, so
    // there is no ordering in which one could shadow the other.
    const record = await getJson<Envelope<QualityRunDto>>(url, `/runs/${runId}`);
    expect(record.data.runId).toBe(runId);
    expect(record.data.trace?.finalDecision).toBe('accept');

    const listed = await getJson<Envelope<RunDumpEntryDto[]>>(url, `/runs/${runId}/dump`);
    expect(listed.data.length).toBeGreaterThan(5);
    expect(listed.data.map((entry) => entry.path)).toContain('manifest.json');
    // Sorted, with byte counts, so a reader can see the shape before asking.
    expect(listed.data.map((entry) => entry.path)).toEqual(
      [...listed.data.map((entry) => entry.path)].sort(),
    );
    expect(listed.data.every((entry) => entry.bytes > 0)).toBe(true);

    // A nested path reaches the file it names, rejoined from the route's segments.
    const nested = listed.data.find((entry) => entry.path.includes('/'));
    if (nested === undefined) throw new Error('the dump has no nested file to read');
    const file = await getJson<Envelope<RunDumpFileDto>>(url, `/runs/${runId}/dump/${nested.path}`);
    expect(file.data).toMatchObject({ path: nested.path, problem: null });
    expect(file.data.text).toEqual(expect.any(String));
  });

  it('[QL-31] a prompt the record leaves out of the trace is readable here', async () => {
    const listed = await getJson<Envelope<RunDumpEntryDto[]>>(url, `/runs/${runId}/dump`);
    const prompt = listed.data.find((entry) => entry.path.endsWith('.user.txt'));
    if (prompt === undefined) throw new Error('the dump recorded no prompt');
    const file = await getJson<Envelope<RunDumpFileDto>>(url, `/runs/${runId}/dump/${prompt.path}`);
    expect(file.data.text).toContain('Goal');
    // And the run record itself still carries none of it — that is the point.
    const record = await getJson<Envelope<QualityRunDto>>(url, `/runs/${runId}`);
    expect(JSON.stringify(record.data)).not.toContain(file.data.text ?? 'unreachable');
  });

  it('[QL-31] a missing dump and a name that is not a key are both 404, claiming nothing more', async () => {
    const absent = '2001-01-01T00-00-00-000-abcdef-quality';
    const missing = await fetch(`${url}/runs/${absent}/dump`);
    expect(missing.status).toBe(404);
    // It says there is no dump, never that there is no run: the two stores
    // legitimately diverge.
    const body = (await missing.json()) as { message: string };
    expect(body.message).toContain('no dump recorded');

    expect((await fetch(`${url}/runs/${runId}/dump/nothing.txt`)).status).toBe(404);
    expect((await fetch(`${url}/runs/${runId}/dump/../../etc/passwd`)).status).toBe(404);
  });
});
