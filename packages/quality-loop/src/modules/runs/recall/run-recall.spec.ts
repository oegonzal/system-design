import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { QualityRunDto, QualityRunSummaryDto } from '@sysdesign/contracts';
import { ensureDatabase, QualityRun, truncateTestTables } from '@sysdesign/db';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PipelineDefinition } from '../../../core/pipeline';
import { MEMORIES_HEADING } from '../../../core/stages/prompting';
import { fakeLlm, gatedLlm, result, tinyPipeline } from '../../../core/testing';
import { memoryPorts } from '../../../orchestrators/memory/steps.testing';
import { MEMORY_RECALL } from '../../../pipelines/memory-recall/definition';
import { MEMORY_RECALL_ID } from '../../../pipelines/memory-recall/input';
import type { InMemoryMemoryStore } from '../../memory/testing';
import { fakeEmbeddings, InMemoryEmbeddingCache } from '../../memory/testing';
import { EMBEDDING_CACHE, EMBEDDING_CLIENT, MEMORY_STORE } from '../../memory/tokens';
import {
  bootApp,
  claimDumpDir,
  getJson,
  postJson,
  type Envelope,
  type Page,
  type ProviderOverride,
} from '../../http/testing';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM } from '../tokens';

const DUMP_DIR = claimDumpDir('quality-loop-recall');
const TABLES = [QualityRun];
const GOAL = '# Goal\n\nMake a thing.';

/** A producer that declares it consumes memories — the coach's shape — beside one that does not. */
const coach = () => {
  const base = tinyPipeline();
  return tinyPipeline({
    id: 'coach',
    producer: { ...base.producer, consumes: ['criteria', 'memories'] },
  });
};
const PIPELINES = new Map<string, PipelineDefinition<unknown>>([
  ['coach', coach() as PipelineDefinition<unknown>],
  ['tiny', tinyPipeline() as PipelineDefinition<unknown>],
  [MEMORY_RECALL_ID, MEMORY_RECALL as PipelineDefinition<unknown>],
]);

/** What the coach's own stages answer: a rubric, an artifact, no findings, a pass. */
const COACH_ANSWERS = [
  { criteria: [{ kind: 'must', statement: 'has text' }] },
  { text: 'made', parts: ['one'] },
  { findings: [] },
  { results: [result({ criterionId: 'c1', locationRefs: ['text'] })], advisoryVerdict: null },
];

/** The curator's words for the two stored lessons — what the producer must see, and nobody else. */
const INSIGHTS = ['Own the store the list page reads from.', 'Write each status change as a row.'];

/** What memory-recall's stages answer: a need and a rule, both chunks kept, every criterion passed. */
const RECALL_ANSWERS = [
  {
    criteria: [
      { kind: 'need', statement: 'the list read stays up' },
      { kind: 'admissibility', statement: 'an insight is only what its chunk says' },
    ],
  },
  {
    summary: 'Both candidates speak to the read path of an order list.',
    kept: [
      { chunk: 'm1', serves: 'the list read', insight: INSIGHTS[0], caveat: null },
      { chunk: 'm2', serves: 'order status', insight: INSIGHTS[1], caveat: 'another prompt' },
    ],
    dropped: [],
    gaps: [],
  },
  { results: [result({ criterionId: 'c1', locationRefs: ['m1'] })], advisoryVerdict: null },
  { results: [result({ criterionId: 'c2', locationRefs: ['m1', 'm2'] })], advisoryVerdict: null },
];

/** Enabled embeddings over a store holding two lessons; the cache in memory. */
const memoryOverrides = (store: InMemoryMemoryStore): ProviderOverride[] => [
  [EMBEDDING_CLIENT, fakeEmbeddings()],
  [EMBEDDING_CACHE, new InMemoryEmbeddingCache()],
  [MEMORY_STORE, store],
  [PIPELINES_TOKEN, PIPELINES],
];

const seededStore = () => memoryPorts().store as InMemoryMemoryStore;

/** Read until `done` holds; the last read is returned either way. */
const pollUntil = async <T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> => {
  let value = await read();
  for (let attempt = 0; attempt < 150 && !done(value); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    value = await read();
  }
  return value;
};

const runOf = (url: string, id: string) =>
  getJson<Envelope<QualityRunDto>>(url, `/runs/${id}`).then((body) => body.data);

const start = async (url: string, body: Record<string, unknown>): Promise<string> => {
  const started = await postJson(url, '/runs', body);
  expect(started.status).toBe(202);
  return ((await started.json()) as Envelope<{ runId: string }>).data.runId;
};

const settled = (url: string, id: string) =>
  pollUntil(
    () => runOf(url, id),
    (run) => run.status !== 'running',
  );

/** Every prompt a run's stages sent, by scope, as its dump recorded them. */
const promptsOf = (runId: string): { scope: string; user: string }[] => {
  const dir = join(DUMP_DIR, runId, '05-llm');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.user.txt'))
    .map((name) => ({
      scope: name.split('.').slice(1, -3).join('.'),
      user: readFileSync(join(dir, name), 'utf8'),
    }));
};

describe('a run that recalls lessons for its producer', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  const store = seededStore();

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await bootApp([
      [QUALITY_LOOP_LLM, fakeLlm(...COACH_ANSWERS, ...RECALL_ANSWERS)],
      ...memoryOverrides(store),
    ]));
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  it('[QL-32] recalls through a recorded memory-recall run and hands the curated lessons to the producer alone', async () => {
    const runId = await start(url, { pipeline: 'coach', goal: GOAL, recall: true });
    const run = await settled(url, runId);
    expect(run.status).toBe('complete');
    expect(run.trace?.finalDecision).toBe('accept');

    // The provenance: recalled, by which run, and exactly the lessons handed on.
    expect(run.recall).toMatchObject({ status: 'recalled', reason: null, count: 2 });
    expect(run.recall?.lessons.map((lesson) => [lesson.ref, lesson.insight])).toEqual([
      ['m1', INSIGHTS[0]],
      ['m2', INSIGHTS[1]],
    ]);
    expect(run.recall?.lessons[1]).toMatchObject({
      serves: 'order status',
      caveat: 'another prompt',
      sourceRunId: 'run-a',
      text: 'record each status transition as a row',
    });
    const recallRunId = run.recall?.recallRunId ?? '';
    const recallRun = await runOf(url, recallRunId);
    expect(recallRun).toMatchObject({ pipeline: MEMORY_RECALL_ID, status: 'complete' });
    expect(recallRun.recall).toBeNull();

    // The producer saw them under their own heading; the deriver, the critic
    // and the evaluator never saw a word of them.
    const prompts = promptsOf(runId);
    const producer = prompts.filter((prompt) => prompt.scope === 'producer');
    expect(producer).toHaveLength(1);
    expect(producer[0].user).toContain(MEMORIES_HEADING);
    for (const insight of INSIGHTS) expect(producer[0].user).toContain(insight);
    const others = prompts.filter((prompt) => prompt.scope !== 'producer');
    expect(others.map((prompt) => prompt.scope).sort()).toEqual(
      ['criteria', 'critic.tiny.s1', 'evaluator.tiny.s1'].sort(),
    );
    for (const prompt of others) {
      expect(prompt.user).not.toContain(MEMORIES_HEADING);
      for (const insight of INSIGHTS) expect(prompt.user).not.toContain(insight);
    }

    // The dump keeps what the producer saw; the list row keeps the provenance without it.
    const dumped = JSON.parse(readFileSync(join(DUMP_DIR, runId, 'recall.json'), 'utf8'));
    expect(dumped).toEqual(run.recall);
    const page = await getJson<Page<QualityRunSummaryDto>>(url, '/runs?pipeline=coach');
    expect(page.data[0]?.recall).toEqual({
      status: 'recalled',
      reason: null,
      note: null,
      recallRunId,
      count: 2,
    });
  });

  it('[QL-32] a run that does not ask never recalls, and a grade-only pipeline is refused before any row', async () => {
    const runId = await start(url, { pipeline: 'coach', goal: GOAL });
    const run = await settled(url, runId);
    expect(run.recall).toBeNull();
    const producer = promptsOf(runId).find((prompt) => prompt.scope === 'producer');
    expect(producer?.user).not.toContain(MEMORIES_HEADING);

    const before = await em.fork().count(QualityRun, {});
    const refused = await postJson(url, '/runs', { pipeline: 'tiny', goal: GOAL, recall: true });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { issues: { path: string }[] }).issues).toEqual([
      { path: 'recall', message: "tiny's producer does not consume memories" },
    ]);
    expect(await em.fork().count(QualityRun, {})).toBe(before);
    const malformed = await postJson(url, '/runs', { pipeline: 'coach', goal: GOAL, recall: 1 });
    expect(malformed.status).toBe(400);
  });

  it('[QL-32] a store that cannot answer costs the coach its lessons, never the run', async () => {
    store.unreachable = true;
    try {
      const runId = await start(url, { pipeline: 'coach', goal: GOAL, recall: true });
      const run = await settled(url, runId);
      expect(run.status).toBe('complete');
      expect(run.recall).toEqual({
        status: 'skipped',
        reason: 'store-unavailable',
        note: 'store unreachable',
        recallRunId: null,
        count: 0,
        lessons: [],
      });
      const producer = promptsOf(runId).find((prompt) => prompt.scope === 'producer');
      expect(producer?.user).not.toContain(MEMORIES_HEADING);
    } finally {
      store.unreachable = false;
    }
  });

  it('[QL-32] a recall that throws is recorded as errored, and the coach still runs', async () => {
    const verify = store.verify.bind(store);
    store.verify = () => Promise.reject(new Error('the store fell over'));
    try {
      const runId = await start(url, { pipeline: 'coach', goal: GOAL, recall: true });
      const run = await settled(url, runId);
      expect(run.status).toBe('complete');
      expect(run.trace?.finalDecision).toBe('accept');
      expect(run.recall).toMatchObject({
        status: 'skipped',
        reason: 'errored',
        note: 'the store fell over',
        count: 0,
      });
    } finally {
      store.verify = verify;
    }
  });
});

describe('a recall in flight, and one that finds nothing', () => {
  let em: EntityManager | null = null;

  afterAll(async () => {
    if (em !== null) await truncateTestTables(em, TABLES);
  });

  it('[QL-32] says it is recalling — naming its recall run once it opens — before the run produces anything', async () => {
    // Call 1 derives the query probes and call 2 the recall run's rubric; the
    // recall run's producer is held, so the recall stands open.
    const llm = gatedLlm(fakeLlm(...COACH_ANSWERS, ...RECALL_ANSWERS), 2);
    const { app, url } = await bootApp([
      [QUALITY_LOOP_LLM, llm],
      ...memoryOverrides(seededStore()),
    ]);
    em = app.get(EntityManager);
    try {
      const runId = await start(url, { pipeline: 'coach', goal: GOAL, recall: true });
      const opened = await runOf(url, runId);
      expect(opened.recall?.status).toBe('recalling');

      const recalling = await pollUntil(
        () => runOf(url, runId),
        (run) => run.recall?.recallRunId != null,
      );
      expect(recalling).toMatchObject({ status: 'running', trace: null });
      expect(recalling.recall).toMatchObject({ status: 'recalling', count: 0, lessons: [] });
      const child = await runOf(url, recalling.recall?.recallRunId ?? '');
      expect(child).toMatchObject({ pipeline: MEMORY_RECALL_ID, status: 'running' });

      llm.release();
      const run = await settled(url, runId);
      expect(run.recall).toMatchObject({ status: 'recalled', count: 2 });
    } finally {
      llm.release();
      await app.close();
    }
  });

  it('[QL-32] a recall the curator does not endorse is empty, names its run, and the coach goes on', async () => {
    // No answer for memory-recall's stages: its run escalates, endorsing nothing.
    const { app, url } = await bootApp([
      [QUALITY_LOOP_LLM, fakeLlm(...COACH_ANSWERS)],
      ...memoryOverrides(seededStore()),
    ]);
    em = app.get(EntityManager);
    try {
      const runId = await start(url, { pipeline: 'coach', goal: GOAL, recall: true });
      const run = await settled(url, runId);
      expect(run.status).toBe('complete');
      expect(run.recall).toMatchObject({
        status: 'empty',
        reason: 'not-accepted',
        count: 0,
        lessons: [],
      });
      expect((await runOf(url, run.recall?.recallRunId ?? '')).pipeline).toBe(MEMORY_RECALL_ID);
    } finally {
      await app.close();
    }
  });
});
