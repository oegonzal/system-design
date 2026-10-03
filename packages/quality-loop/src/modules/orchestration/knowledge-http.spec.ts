import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import {
  ensureDatabase,
  MemorySupport,
  OrchestrationRun,
  OrchestrationRunChild,
  QualityRun,
  truncateTestTables,
} from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { bootApp, claimDumpDir, getJson, postJson, type Envelope } from '../http/testing';
import { fakeEmbeddings, InMemoryMemoryStore } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { CANNED, settledOrchestration } from './testing';

const DUMP_DIR = claimDumpDir('knowledge-http');
// `memory_support` points at `quality_run`, so it is emptied before the runs are.
const TABLES = [MemorySupport, OrchestrationRunChild, OrchestrationRun, QualityRun];

const GOAL = [
  '# Prompt — Serve an order history',
  '',
  '## Functional requirements',
  '',
  '1. List orders newest first.',
  '2. Show each order status.',
].join('\n');

/**
 * The knowledge digest's own answers, tried before the shared ones so its
 * criteria are the ones with a `delta` — a kind no other pipeline declares, which
 * is what keeps this from matching another pipeline's deriver.
 */
const KNOWLEDGE_CANNED: readonly unknown[] = [
  {
    criteria: [
      { kind: 'signal', statement: 'Accounts for r1 passing at i1.' },
      { kind: 'held', statement: 'r2 passed in every iteration that judged it.' },
      { kind: 'delta', statement: 'k1 is the lesson r1 shows, so the digest must confirm it.' },
    ],
  },
  {
    summary:
      'The run confirms what the store held about owning the read store, and types the rest.',
    memories: [
      {
        kind: 'fact',
        evidence: ['r1'],
        insight:
          'A list read served from a store the answering service owns does not depend on the upstream being reachable.',
        appliesWhen: 'a requirement is served from data another system produces',
        dimension: 'completeness',
        topics: ['read-path', 'upstream-outage'],
        confirms: [],
        contradicts: [],
      },
    ],
    unused: ['r2'],
  },
  { findings: [] },
  // One answer per evaluator: coverage judges the signal and the held criterion,
  // novelty judges the delta, and each schema admits only its own ids.
  {
    results: [
      {
        criterionId: 'c1',
        result: 'pass',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'the item rests on r1 and states what it shows',
      },
      {
        criterionId: 'c2',
        result: 'pass',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'the item accounts for the criterion that held',
      },
    ],
    advisoryVerdict: null,
  },
  {
    results: [
      {
        criterionId: 'c3',
        result: 'pass',
        confidence: 'high',
        locationRefs: ['memory.1'],
        rationale: 'nothing known bears on it, which the digest says by leaving it alone',
      },
    ],
    advisoryVerdict: null,
  },
];

describe('the knowledge HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  const store = new InMemoryMemoryStore();

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await bootApp([
      [QUALITY_LOOP_LLM, fakeLlm(...KNOWLEDGE_CANNED, ...CANNED)],
      [EMBEDDING_CLIENT, fakeEmbeddings()],
      [MEMORY_STORE, store],
    ]));
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  it('[QL-43] a finished run is learned from over HTTP, and learning from it twice changes nothing', async () => {
    // A run to learn from, started and settled the ordinary way.
    const started = await postJson(url, '/runs', {
      pipeline: 'system-design',
      goal: GOAL,
      maxIterations: 1,
    });
    expect(started.status).toBe(202);
    const { runId } = ((await started.json()) as Envelope<{ runId: string }>).data;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const run = (await getJson<Envelope<QualityRunDto>>(url, `/runs/${runId}`)).data;
      if (run.status !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const source = (await getJson<Envelope<QualityRunDto>>(url, `/runs/${runId}`)).data;
    expect(source.status).toBe('complete');

    const learn = await postJson(url, '/orchestrations/knowledge/from-run', { runId });
    expect(learn.status).toBe(202);
    const { orchestrationRunId } = (
      (await learn.json()) as Envelope<{
        orchestrationRunId: string;
      }>
    ).data;
    const record: OrchestrationRunDto = await settledOrchestration(url, orchestrationRunId);

    expect(record.status).toBe('complete');
    expect(record.orchestrator).toBe('knowledge');
    // The run handed in stands in for the target; nothing re-ran it.
    expect(record.steps['target']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: [runId],
    });
    // Nothing was stored before this, so there is nothing to know yet — and the
    // digest ran anyway.
    expect(record.steps['known']).toMatchObject({ status: 'skipped', reason: 'store-empty' });
    expect(record.steps['digest']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { items: 1, kept: 1, confirming: 0 },
      report: { source: { pipeline: 'system-design', version: '1.0.0' }, known: 0 },
    });
    expect(record.steps['store']).toMatchObject({ status: 'complete', reason: null });

    // The item is stored under the source run, typed, and faceted from the policy.
    const item = [...store.points.values()].find((point) => point.source.kind === 'fact');
    expect(item).toBeDefined();
    expect(item?.source).toMatchObject({
      runId,
      pipeline: 'system-design',
      ref: 'knowledge.1',
      iteration: 1,
    });
    expect(item?.facets).toMatchObject({ dimension: 'completeness', grounding: 'held' });
    expect(item?.digestRunId).toBe(record.steps['digest'].runIds[0]);

    const before = {
      points: [...store.points.keys()].sort(),
      rows: await em.fork().count(MemorySupport, {}),
    };

    // Learning from the same run again replaces its own points and rows.
    const again = await postJson(url, '/orchestrations/knowledge/from-run', { runId });
    const second: OrchestrationRunDto = await settledOrchestration(
      url,
      ((await again.json()) as Envelope<{ orchestrationRunId: string }>).data.orchestrationRunId,
    );
    expect(second.status).toBe('complete');
    expect([...store.points.keys()].sort()).toEqual(before.points);
    expect(await em.fork().count(MemorySupport, {})).toBe(before.rows);

    // And the second time around the store was not empty, so it was asked what it knew.
    expect(second.steps['known'].status).toBe('complete');
    const known = second.steps['known'].report as { known: { runId: string }[] };
    // Never the run's own points: everything stored so far is this run's.
    expect(known.known).toEqual([]);
  });
});
