import { NestFactory } from '@nestjs/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ensureDatabase, QualityRun } from '@sysdesign/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RunJanitor } from '../janitor/run-janitor';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, RUN_REPOSITORY } from '../runs/tokens';
import { ReplayModule } from './replay.module';

const PROVIDER_VARS = ['ANTHROPIC_API_KEY', 'QUALITY_LOOP_AUTH'] as const;

describe('the replay module', () => {
  const saved = new Map<string, string | undefined>();

  beforeAll(async () => {
    await ensureDatabase();
    for (const name of PROVIDER_VARS) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterAll(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('[QL-22] boots without a model provider, reads runs and pipelines, and never sweeps a running run', async () => {
    const seed = await NestFactory.createApplicationContext(ReplayModule, { logger: false });
    const id = `replay-${crypto.randomUUID().slice(0, 8)}-quality`;
    try {
      const em = seed.get(EntityManager).fork();
      em.create(QualityRun, {
        id,
        pipeline: 'tiny',
        pipelineVersion: '0.0.1',
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
        // Stale by any threshold: a sweeper would fail it at boot.
        heartbeatAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      await em.flush();
    } finally {
      await seed.close();
    }

    const app = await NestFactory.createApplicationContext(ReplayModule, { logger: false });
    try {
      expect(app.get(PIPELINES_TOKEN)).toBeInstanceOf(Map);
      expect(app.get(RUN_REPOSITORY)).toBeDefined();
      expect(() => app.get(QUALITY_LOOP_LLM)).toThrow();
      expect(() => app.get(RunJanitor)).toThrow();
      const row = await app.get(EntityManager).fork().findOne(QualityRun, { id });
      expect(row?.status).toBe('running');
      await app.get(EntityManager).fork().nativeDelete(QualityRun, { id });
    } finally {
      await app.close();
    }
  });
});
