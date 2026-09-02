import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type { CanvasGraph } from '@sysdesign/contracts';
import {
  DesignRevision,
  DesignSession,
  ensureDatabase,
  EvalJob,
  Evaluation,
  ExperienceProfile,
  ImprovementRun,
  Prompt,
} from '@sysdesign/db';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Set before AppModule is imported anywhere Nest reads them: both pollers'
// intervals are constructor-time, and grading must stay deterministic so the
// trajectory-vs-evaluation parity assertion below is exact.
process.env['EVAL_POLL_INTERVAL_MS'] = '150';
process.env['IMPROVE_POLL_INTERVAL_MS'] = '150';
process.env['EVAL_DETERMINISTIC'] = '1';
process.env['EVAL_DUMP_DIR'] = join(tmpdir(), `sysdesign-improver-dumps-${crypto.randomUUID()}`);

const { AppModule } = await import('../app/app.module');
const { IMPROVER_LLM } = await import('./llm.token');

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

/**
 * The coach, scripted: call 1 proposes a real improvement (a walkthrough for
 * every component plus a read replica), call 2 proposes nothing new (a tie —
 * the strict gate must reject it), call 3 refuses. Deterministic, keyless.
 */
function scriptedCoach(): LlmClient {
  let calls = 0;
  return {
    enabled: true,
    model: 'scripted-coach',
    completeStructured: <T>(_request: StructuredRequest<T>): Promise<T | null> => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({
          description: 'Add a read replica and explain every component in a walkthrough.',
          graphOps: [
            {
              op: 'add-node',
              node: {
                id: 'ai-replica',
                kind: 'replica',
                label: 'Read Replica',
                configEntries: [{ key: 'replicas', value: 2 }],
              },
            },
            { op: 'add-edge', edge: { id: 'ai-repl', source: 'n-db', target: 'ai-replica' } },
          ],
          narrative: {
            overview:
              'The checkout path stays a simple three-tier flow. A read replica now shields the primary so browsing the sale never competes with order writes.',
            componentRationales: [
              {
                nodeId: 'n-client',
                prose:
                  'The buyer drives everything from the browser. It holds no state beyond the session.',
              },
              {
                nodeId: 'n-svc',
                prose:
                  'The checkout service owns the order lifecycle. It validates stock before accepting a purchase.',
              },
              {
                nodeId: 'n-db',
                prose:
                  'The orders database is the single source of truth. Writes land here first and replicate outward.',
              },
              {
                nodeId: 'ai-replica',
                prose:
                  'The replica serves read traffic during the sale spike. It keeps the primary free for order writes.',
              },
            ],
            flowNarrations: [
              {
                requirementIndex: 0,
                prose:
                  'The buyer requests tickets through the service. The service reads availability from the replica and answers.',
              },
              {
                requirementIndex: 1,
                prose:
                  'A purchase writes through the service to the primary database. The stock check happens in the same transaction to prevent overselling.',
              },
            ],
          },
          brief: {
            nfrBindings: [
              { nfrId: 'fst-lat-read-spike', nodeIds: ['ai-replica'], mechanism: 'read-replica' },
              { nfrId: 'fst-avail-sale-window', nodeIds: ['n-db'], mechanism: 'backups' },
            ],
            flows: [
              { id: 'ai-flow-browse', requirementIndex: 0, path: ['e1', 'e2'] },
              { id: 'ai-flow-buy', requirementIndex: 1, path: ['e1', 'e2'] },
            ],
          },
        } as T);
      }
      if (calls === 2) {
        // No ops, no documents: assembles to the identical design — a tie.
        return Promise.resolve({ description: 'Polish nothing in particular.' } as T);
      }
      return Promise.resolve(null);
    },
  };
}

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

describe('improvement runs (integration)', () => {
  let app: INestApplication;
  let em: EntityManager;

  async function seedRun(maxIterations: number) {
    const fork = em.fork();
    const experience = fork.create(ExperienceProfile, {
      id: crypto.randomUUID(),
      slug: `exp-${crypto.randomUUID().slice(0, 8)}`,
      companyLabel: 'Test platform',
      title: 'Test experience',
      summary: 'seeded by improver.spec',
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
      graph: naiveGraph,
      narrative: null,
      brief: null,
    });
    fork.create(Evaluation, { revision });
    fork.create(EvalJob, { revision });
    const run = fork.create(ImprovementRun, { session, baseRevision: revision, maxIterations });
    await fork.flush();
    return { runId: run.id, sessionId: session.id, baseRevisionId: revision.id };
  }

  beforeAll(async () => {
    await ensureDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IMPROVER_LLM)
      .useValue(scriptedCoach())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init(); // starts both poll loops
    em = app.get(EntityManager);
  });

  afterAll(async () => {
    const connection = em.fork().getConnection();
    const specExperiences = `select id from "experience_profile" where "slug" like 'exp-%'`;
    await connection.execute(
      `delete from "design_session" where "prompt_id" in (select id from "prompt" where "experience_id" in (${specExperiences}))`,
    );
    await connection.execute(`delete from "prompt" where "experience_id" in (${specExperiences})`);
    await connection.execute(`delete from "experience_profile" where "slug" like 'exp-%'`);
    await app.close();
  });

  it('[EVAL-14] raises the score monotonically: accepted iterations persist as assistant revisions, rejected candidates never do', async () => {
    const { runId, sessionId, baseRevisionId } = await seedRun(3);

    const done = await waitFor(async () => {
      const run = await em.fork().findOne(ImprovementRun, { id: runId });
      return run && ['completed', 'failed'].includes(run.status) ? run : null;
    });

    expect(done.status).toBe('completed');
    expect(done.stoppedReason).toBe('max-iterations');
    expect(done.error).toBeNull();

    // The trajectory: baseline, one accepted improvement, a tie rejected by
    // the strict gate, a refusal — proposals stop at maxIterations.
    const [baseline, improved, tie, refusal] = done.iterations;
    expect(baseline).toMatchObject({
      iteration: 0,
      proposer: 'baseline',
      accepted: true,
      revisionId: baseRevisionId,
    });
    expect(improved.accepted).toBe(true);
    expect(improved.revisionId).toBeTruthy();
    expect(improved.score).toBeGreaterThan(baseline.score);
    expect(tie).toMatchObject({ accepted: false, revisionId: null, rejectedReason: 'not-better' });
    expect(refusal).toMatchObject({
      accepted: false,
      revisionId: null,
      rejectedReason: 'no-proposal',
    });

    // Accepted scores strictly rise; nothing else became a revision.
    const accepted = done.iterations.filter((entry) => entry.accepted);
    for (let i = 1; i < accepted.length; i++) {
      expect(accepted[i].score).toBeGreaterThan(accepted[i - 1].score);
    }
    const revisions = await em
      .fork()
      .find(DesignRevision, { session: sessionId }, { orderBy: { revisionNumber: 'asc' } });
    expect(revisions.map((revision) => [revision.revisionNumber, revision.origin])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
    ]);
    expect(done.bestRevision?.id).toBe(improved.revisionId);

    // The assistant revision rides the NORMAL eval pipeline, and — the
    // façade/orchestrator parity guard — its persisted deterministic grade
    // equals the trajectory score the gate accepted it at.
    const assistantRevision = revisions[1];
    expect(await em.fork().findOne(EvalJob, { revision: assistantRevision.id })).not.toBeNull();
    const graded = await waitFor(async () => {
      const evaluation = await em.fork().findOne(Evaluation, { revision: assistantRevision.id });
      return evaluation?.status === 'complete' ? evaluation : null;
    });
    expect(graded.overallScore).toBe(improved.score);
  });
});
