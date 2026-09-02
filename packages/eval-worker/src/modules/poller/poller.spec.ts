import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { CanvasGraph, DesignBrief, DesignNarrative } from '@sysdesign/contracts';
import {
  DesignRevision,
  DesignSession,
  EvalJob,
  Evaluation,
  ExperienceProfile,
  Prompt,
} from '@sysdesign/db';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { backoffMs } from './eval-runner.service';

// Set before AppModule is imported anywhere Nest reads them: the poller's
// interval is constructor-time and the LLM client provider is boot-time.
process.env['EVAL_POLL_INTERVAL_MS'] = '150';
process.env['EVAL_DETERMINISTIC'] = '1';
// A directory of this file's own, so the assertions below never see a dump
// another suite (or an earlier run) left behind.
const DUMP_DIR = join(tmpdir(), `sysdesign-poller-dumps-${crypto.randomUUID()}`);
process.env['EVAL_DUMP_DIR'] = DUMP_DIR;

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
  async function seedJob(
    graph: CanvasGraph,
    maxAttempts = 3,
    narrative: DesignNarrative | null = null,
    brief: DesignBrief | null = null,
  ) {
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
      functionalCapabilities: [],
      functionalRequirements: ['sell tickets', 'prevent overselling'],
      nonFunctionalRequirements: [
        {
          id: 'fst-lat-read-spike',
          kind: 'latency',
          statement: 'fast reads',
          target: 'p99 ≤ 300ms',
          targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 300, unit: 'ms' },
        },
        {
          id: 'fst-avail-sale-window',
          kind: 'availability',
          statement: 'stay up',
          target: '99.95%',
          targetSpec: { metric: 'availability_pct', op: '>=', value: 99.95, unit: '%' },
        },
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
      generatorVersion: '2.0.0',
    });
    const session = fork.create(DesignSession, { prompt });
    const revision = fork.create(DesignRevision, {
      session,
      revisionNumber: 1,
      graph,
      narrative,
      brief,
    });
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
    expect(done.engineVersion).toBe('2.6.0');
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
    expect(done.profileVersion).toBe('3.2.0');
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

  it('feeds the revision brief to the engine — the brief expectations grade it', async () => {
    // A brief that names a mechanism the naive canvas does not provide: the
    // claim is stored and graded, never rejected, and explanation is scored.
    const { evaluationId } = await seedJob(
      naiveGraph,
      3,
      {
        version: 1,
        componentRationales: [
          {
            nodeId: 'n-db',
            prose: 'The database persists every order and backs the availability claim.',
          },
        ],
        flowNarrations: [],
      },
      {
        version: 1,
        nfrBindings: [{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-db'], mechanism: 'backups' }],
        flows: [],
      },
    );

    const done = await waitFor(async () => {
      const evaluation = await em
        .fork()
        .findOne(Evaluation, { id: evaluationId }, { populate: ['findings'] });
      return evaluation?.status === 'complete' ? evaluation : null;
    });

    const unmetIds = done.findings
      .getItems()
      .filter((finding) => finding.source === 'expectation')
      .map((finding) => finding.expectationId);
    expect(unmetIds).toContain('exp.brf.mechanisms-corroborated');
    const ruleIds = done.findings.getItems().map((finding) => finding.ruleId);
    expect(ruleIds).toContain('explanation.unbacked-binding');
    expect(done.dimensionScores?.explanation).not.toBeNull();
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

  /**
   * The run dump. The evaluation row keeps the verdict; this keeps the working
   * — inputs, per-pass timing, the scoring arithmetic, and every model call.
   */
  describe('run dump', () => {
    /** The dump is written in a `finally`, just after the row goes complete. */
    function waitForDump(match: (manifest: Record<string, unknown>) => boolean) {
      return waitFor(async () => {
        if (!existsSync(DUMP_DIR)) return null;
        for (const entry of readdirSync(DUMP_DIR)) {
          const manifestPath = join(DUMP_DIR, entry, 'manifest.json');
          if (!existsSync(manifestPath)) continue;
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
            string,
            unknown
          >;
          if (match(manifest)) return { dir: join(DUMP_DIR, entry), manifest };
        }
        return null;
      });
    }

    const read = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));

    it('[EVAL-13] writes the inputs, the arithmetic and the result for a graded run', async () => {
      const { evaluationId } = await seedJob(naiveGraph);
      const { dir, manifest } = await waitForDump((m) => m['evaluationId'] === evaluationId);

      expect(manifest).toMatchObject({ kind: 'eval', status: 'complete', phase: 'complete' });
      expect(manifest['runId']).toMatch(/-eval$/);

      // The inputs the engine actually read — none of which the row keeps.
      expect(read(dir, '02-submission.json').graph.nodes).toHaveLength(3);
      expect(read(dir, '03-facts.json').archetype).toBe('flash-sale-ticketing');
      expect(read(dir, '04-profile.json').profile.version).toBe('3.2.0');

      // Per-pass timing and options, also discarded before now.
      const passes = read(dir, '05-passes.json') as { passId: string }[];
      expect(passes.map((pass) => pass.passId)).toEqual([
        'rules.core',
        'expectations.banks',
        'llm.critic',
        'llm.depth',
        'llm.narrative',
        'llm.workability',
        'llm.scenarios',
      ]);

      // The arithmetic reproduces the number the candidate was given.
      const trace = read(dir, '08-scoring.json');
      const result = read(dir, '09-result.json');
      expect(trace.overallScore).toBe(result.overallScore);
      expect(Math.round((trace.weightedTotal / trace.weightSum) * 10) / 10).toBe(
        result.overallScore,
      );
      expect(manifest['overallScore']).toBe(result.overallScore);
    });

    it('[EVAL-13] says plainly that a deterministic run had nothing to capture', async () => {
      const { evaluationId } = await seedJob(naiveGraph);
      const { dir, manifest } = await waitForDump((m) => m['evaluationId'] === evaluationId);

      expect(manifest['llm']).toEqual({ enabled: false, model: null, reason: 'deterministic' });
      expect(manifest['exchangeCount']).toBe(0);
      // Not a lost capture: every LLM pass returns before assembling a prompt.
      expect(existsSync(join(dir, '06-llm'))).toBe(false);
      expect(readFileSync(join(dir, 'run.md'), 'utf8')).toContain('the model is off');
    });

    it('[EVAL-13] dumps a run that failed, which is when it is most wanted', async () => {
      const corrupt = { nodes: null, edges: [] } as unknown as CanvasGraph;
      const { evaluationId } = await seedJob(corrupt, 1);

      const failed = await waitFor(async () => {
        const evaluation = await em.fork().findOne(Evaluation, { id: evaluationId });
        return evaluation?.status === 'failed' ? evaluation : null;
      });
      expect(failed.error).toBeTruthy();

      const { dir, manifest } = await waitForDump(
        (m) => m['status'] === 'failed' && m['revisionId'] !== null,
      );
      // The row keeps only a message; the dump keeps the phase and the inputs.
      expect(manifest['phase']).toBe('evaluating');
      expect((manifest['error'] as { message: string }).message).toBeTruthy();
      expect(read(dir, '02-submission.json').graph.nodes).toBeNull();
    });

    it('[EVAL-13] indexes one flat line per run', async () => {
      const { evaluationId } = await seedJob(naiveGraph);
      await waitForDump((m) => m['evaluationId'] === evaluationId);

      const rows = readFileSync(join(DUMP_DIR, 'index.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const row = rows.find((candidate) => candidate['evaluationId'] === evaluationId);
      expect(row).toMatchObject({ kind: 'eval', status: 'complete', llmEnabled: false });
      // One row per run — several worker processes append to this file, so the
      // write has to stay a single atomic line.
      expect(rows.filter((candidate) => candidate['runId'] === row?.['runId'])).toHaveLength(1);
    });

    afterAll(() => rmSync(DUMP_DIR, { recursive: true, force: true }));
  });
});
