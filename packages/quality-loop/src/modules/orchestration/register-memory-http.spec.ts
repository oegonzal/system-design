import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import { REGISTER_DIGEST_MAX_ITERATIONS, registerDigestReportSchema } from '@sysdesign/contracts';
import {
  OrchestrationRun,
  OrchestrationRunChild,
  QualityRun,
  truncateTestTables,
} from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { judgedClean } from '../../orchestrators/register-memory/testing';
import { registerDigestGoal, sampleRegisterDigest } from '../../pipelines/register-digest/testing';
import {
  bootApp,
  claimDumpDir,
  getJson,
  postJson,
  type Envelope,
  type Page,
} from '../http/testing';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { settledOrchestration } from './testing';

const DUMP_DIR = claimDumpDir('register-memory-http');
const TABLES = [OrchestrationRunChild, OrchestrationRun, QualityRun];
const GOAL = registerDigestGoal();

/** What the service refuses before a row exists, and in whose words. */
const REFUSED: [body: Record<string, unknown>, message: RegExp][] = [
  [{ goal: 'Just a prompt.' }, /carries no register-digest index/],
  [{ goal: GOAL, pipeline: 'register-digest' }, /chooses its own pipeline/],
  [{ goal: GOAL, output: sampleRegisterDigest() }, /a digest handed in is refused/],
  [
    { goal: GOAL, criteria: [{ id: 'c1', kind: 'capture', statement: 'Captures anything.' }] },
    /a rubric handed in is refused/,
  ],
];

describe('the register-memory HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;

  beforeAll(async () => {
    ({ app, url } = await bootApp([[QUALITY_LOOP_LLM, fakeLlm(...judgedClean())]]));
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  const start = (body: Record<string, unknown>): Promise<Response> =>
    postJson(url, '/orchestrations/register-memory', body);

  it('[QL-78] a request it refuses is answered 400 and leaves no row; a composed text is digested under the budget its record states, and the step’s report reads with the contract', async () => {
    for (const [body, message] of REFUSED) {
      const refused = await start(body);
      expect(refused.status).toBe(400);
      expect(((await refused.json()) as { message: string }).message).toMatch(message);
    }
    const listed = await getJson<Page<OrchestrationRunDto>>(
      url,
      '/orchestrations?orchestrator=register-memory',
    );
    expect(listed.meta.total).toBe(0);

    const started = await start({ goal: GOAL, maxIterations: REGISTER_DIGEST_MAX_ITERATIONS });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record = await settledOrchestration(url, data.orchestrationRunId);

    expect(record).toMatchObject({
      status: 'complete',
      orchestrator: 'register-memory',
      pipeline: null,
    });
    expect(record.context).toEqual({});
    expect(record.request.maxIterations).toBe(REGISTER_DIGEST_MAX_ITERATIONS);
    const step = record.steps['digest'];
    expect(step).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { memories: 3, endorsed: 3, withheld: 0 },
    });
    expect(registerDigestReportSchema.parse(step.report)).toMatchObject({
      admission: 'admitted',
      endorsed: ['memory.1', 'memory.2', 'memory.3'],
      withheld: [],
    });

    // The child ran under the budget the record states, handed nothing but the goal.
    expect(step.runIds).toHaveLength(1);
    const child = (await getJson<Envelope<QualityRunDto>>(url, `/runs/${step.runIds[0]}`)).data;
    expect(child).toMatchObject({ pipeline: 'register-digest', status: 'complete' });
    expect(child.request).toMatchObject({
      goal: GOAL,
      maxIterations: record.request.maxIterations,
      outputProvided: false,
      criteriaProvided: false,
    });
  });
});
