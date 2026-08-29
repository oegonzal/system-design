import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { CanvasGraph } from '@sysdesign/contracts';
import {
  DesignRevision,
  DesignSession,
  EvalJob,
  Evaluation,
  ExperienceProfile,
  Prompt,
} from '@sysdesign/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { backoffMs } from './eval-runner.service';

// Set before AppModule is imported anywhere Nest reads them: the poller's
// interval is constructor-time and the critic factory is boot-time.
process.env['EVAL_POLL_INTERVAL_MS'] = '150';
process.env['EVAL_DETERMINISTIC'] = '1';

const { AppModule } = await import('../app/app.module');

const naiveGraph: CanvasGraph = {
  nodes: [
    { id: 'n-client', kind: 'client', label: 'Buyer' },
    { id: 'n-svc', kind: 'service', label: 'Checkout' },
    { id: 'n-db', kind: 'database', label: 'Orders' },
  ],
  edges: [
    { id: 'e1', source: 'n-client', target: 'n-svc' },
    { id: 'e2', source: 'n-svc', target: 'n-db' },
  ],
};

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

describe('poller (integration)', () => {
  let app: INestApplication;
  let em: EntityManager;

  /** Inserts a full prompt→session→revision→evaluation→job chain. */
  async function seedJob(graph: CanvasGraph, maxAttempts = 3) {
    const fork = em.fork();
    const experience = fork.create(ExperienceProfile, {
      id: crypto.randomUUID(),
      slug: `exp-${crypto.randomUUID().slice(0, 8)}`,
      companyLabel: 'Test platform',
      title: 'Test experience',
      summary: 'seeded by poller.spec',
      archetype: 'flash-sale-ticketing',
      techStack: ['Node.js'],
      scaleFacts: { concurrentUsers: 10000 },
      highlights: ['tested'],
    });
    const prompt = fork.create(Prompt, {
      experience,
      archetype: 'flash-sale-ticketing',
      title: 'Design a ticket on-sale platform',
      scenario: 'Survive the drop.',
      functionalRequirements: ['sell tickets', 'prevent overselling'],
      nonFunctionalRequirements: [
        { kind: 'latency', statement: 'fast reads', target: 'p99 ≤ 300ms' },
        { kind: 'availability', statement: 'stay up', target: '99.95%' },
      ],
      scaleTargets: {
        concurrentUsers: 10000,
        requestsPerSecond: 4000,
        readWriteRatio: '80:20',
        p99LatencyMs: 300,
        availabilityPct: '99.95',
      },
      difficulty: 'standard',
      seed: 1,
      generatorVersion: '1.0.0',
    });
    const session = fork.create(DesignSession, { prompt });
    const revision = fork.create(DesignRevision, { session, revisionNumber: 1, graph });
    const evaluation = fork.create(Evaluation, { revision });
    const job = fork.create(EvalJob, { revision, maxAttempts });
    await fork.flush();
    return { revisionId: revision.id, evaluationId: evaluation.id, jobId: job.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // starts the poll loop
    em = app.get(EntityManager);
  });

  afterAll(async () => {
    // This spec shares a database with the API suite locally — remove every
    // row this file seeded (sessions cascade to revisions → evaluations →
    // findings → jobs; prompts and experiences are restrict-protected, so
    // they go last, narrowest first).
    const connection = em.fork().getConnection();
    const specExperiences = `select id from "experience_profile" where "slug" like 'exp-%'`;
    await connection.execute(
      `delete from "design_session" where "prompt_id" in (select id from "prompt" where "experience_id" in (${specExperiences}))`,
    );
    await connection.execute(`delete from "prompt" where "experience_id" in (${specExperiences})`);
    await connection.execute(`delete from "experience_profile" where "slug" like 'exp-%'`);
    await app.close();
  });

  it('[EVAL-1] claims a queued job and persists a graded evaluation with findings', async () => {
    const { evaluationId, jobId } = await seedJob(naiveGraph);

    const done = await waitFor(async () => {
      const evaluation = await em
        .fork()
        .findOne(Evaluation, { id: evaluationId }, { populate: ['findings'] });
      return evaluation?.status === 'complete' ? evaluation : null;
    });

    expect(done.overallScore).toBeGreaterThan(0);
    expect(done.grade).toBeTruthy();
    expect(done.dimensionScores).toBeTruthy();
    expect(done.engineVersion).toBe('2.0.0');
    // EVAL_DETERMINISTIC=1 → no-op critic: engine summary, no model recorded.
    expect(done.criticModel).toBeNull();
    expect(done.summary).toBeTruthy();

    const findings = done.findings.getItems();
    expect(findings.length).toBeGreaterThan(0);
    // The deterministic passes persist both violation and coverage findings —
    // never anything LLM-sourced under EVAL_DETERMINISTIC.
    expect(findings.every((finding) => finding.source !== 'llm')).toBe(true);
    const ruleFindings = findings.filter((finding) => finding.source === 'rule');
    const coverageFindings = findings.filter((finding) => finding.source === 'expectation');
    expect(ruleFindings.length).toBeGreaterThan(0);
    expect(coverageFindings.length).toBeGreaterThan(0);
    expect(ruleFindings.every((finding) => finding.ruleId !== null)).toBe(true);
    expect(
      coverageFindings.every(
        (finding) => finding.expectationId !== null && finding.ruleId === null,
      ),
    ).toBe(true);

    const job = await em.fork().findOneOrFail(EvalJob, { id: jobId });
    expect(job.status).toBe('completed');
    expect(job.attempts).toBe(1);
  });

  it('[EVAL-8] records the grading profile and the evidence trail', async () => {
    const { evaluationId } = await seedJob(naiveGraph);

    const done = await waitFor(async () => {
      const evaluation = await em.fork().findOne(Evaluation, { id: evaluationId });
      return evaluation?.status === 'complete' ? evaluation : null;
    });

    expect(done.profileId).toBe('default');
    expect(done.profileVersion).toBe('2.0.0');
    const artifactKinds = (done.evidence ?? []).map(
      (artifact) => (artifact as { kind: string }).kind,
    );
    expect(artifactKinds).toContain('findings');
    expect(artifactKinds).toContain('coverage');
    expect(artifactKinds).toContain('diagnostics'); // the skipped LLM pass, on the record
    expect(done.axes).toEqual([]);
    expect(done.scenarios).toEqual([]);
    expect(done.capApplied).toBeNull(); // an F is already below every cap
  });

  it('marks the job and evaluation failed when the graph is unprocessable and retries are exhausted', async () => {
    const corrupt = { nodes: null, edges: [] } as unknown as CanvasGraph;
    const { evaluationId, jobId } = await seedJob(corrupt, 1);

    const failed = await waitFor(async () => {
      const evaluation = await em.fork().findOne(Evaluation, { id: evaluationId });
      return evaluation?.status === 'failed' ? evaluation : null;
    });

    expect(failed.error).toBeTruthy();
    const job = await em.fork().findOneOrFail(EvalJob, { id: jobId });
    expect(job.status).toBe('failed');
    expect(job.lastError).toBeTruthy();
  });

  it('backoff grows exponentially and caps at five minutes', () => {
    expect(backoffMs(1)).toBe(10_000);
    expect(backoffMs(2)).toBe(20_000);
    expect(backoffMs(3)).toBe(40_000);
    expect(backoffMs(20)).toBe(300_000);
  });
});
