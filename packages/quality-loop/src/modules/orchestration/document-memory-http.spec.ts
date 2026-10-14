import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  OrchestrationRunDto,
  QualityRunDto,
  RetractedMemoryPointDto,
  RetractedMemoryRunDto,
  RetrievalReportDto,
} from '@sysdesign/contracts';
import { renderDocumentGoal, resumeChunk } from '@sysdesign/contracts';
import {
  ensureDatabase,
  OrchestrationRun,
  OrchestrationRunChild,
  QualityRun,
  truncateTestTables,
} from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm } from '../../core/testing';
import { sampleDocumentDigest } from '../../pipelines/document-digest/testing';
import { bootApp, claimDumpDir, getJson, postJson, type Envelope } from '../http/testing';
import { fakeEmbeddings, InMemoryMemoryStore } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { settledOrchestration } from './testing';

const DUMP_DIR = claimDumpDir('document-memory-http');
const TABLES = [OrchestrationRunChild, OrchestrationRun, QualityRun];
const GOAL = renderDocumentGoal(resumeChunk());

/** One result per evaluator: the capture evaluator's schema is locked to c1, the rules evaluator's to c2. */
const result = (criterionId: string) => ({
  results: [
    {
      criterionId,
      result: 'pass',
      confidence: 'high',
      locationRefs: ['memory.1'],
      rationale: 'stated by the cited section',
    },
  ],
  advisoryVerdict: null,
});

/** Canned answers for the document-digest pipeline alone: its criteria kinds and its artifact match no other pipeline's schema. */
const CANNED: readonly unknown[] = [
  {
    criteria: [
      {
        kind: 'fact',
        statement:
          'Captures the role in section.2: Senior Software Engineer at Acme, 2020–2026, TypeScript on AWS Lambda.',
      },
      { kind: 'rule', statement: 'Every memory states only what its cited sections state.' },
    ],
  },
  sampleDocumentDigest(),
  { findings: [] },
  result('c1'),
  result('c2'),
];

describe('the document-memory HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  const store = new InMemoryMemoryStore();

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await bootApp([
      [QUALITY_LOOP_LLM, fakeLlm(...CANNED)],
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

  it('[QL-40] a document chunk is digested and stored as facts with the digest run as their source, and the retrieval report then lists them', async () => {
    const refused = await postJson(url, '/orchestrations/document-memory', {
      goal: 'Just a prompt.',
    });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toMatch(
      /carries no document-digest index/,
    );
    const named = await postJson(url, '/orchestrations/document-memory', {
      goal: GOAL,
      pipeline: 'document-digest',
    });
    expect(named.status).toBe(400);
    expect(((await named.json()) as { message: string }).message).toMatch(/chooses its own/);

    const started = await postJson(url, '/orchestrations/document-memory', {
      goal: GOAL,
      maxIterations: 1,
    });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record: OrchestrationRunDto = await settledOrchestration(url, data.orchestrationRunId);

    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.context['embedding']).toEqual({
      enabled: true,
      model: 'fake-embedding',
      reason: null,
    });
    expect(record.context['store']).toMatchObject({ ready: true, chunks: 0 });
    expect(record.steps['digest']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { memories: 2, kept: 2 },
      report: {
        kind: 'resume',
        title: 'Résumé',
        subject: 'Alex Example',
        date: '2026-03-01',
        chunk: { index: 1, of: 1 },
      },
    });
    expect(record.steps['digest'].runIds).toHaveLength(1);
    expect(record.steps['store']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: [],
      counts: { chunks: 2 },
    });

    const digestRunId = record.steps['digest'].runIds[0];
    const points = [...store.points.values()];
    expect(points).toHaveLength(2);
    for (const point of points) {
      expect(point.source).toMatchObject({ runId: digestRunId, pipeline: 'document-digest' });
      expect(point.digestRunId).toBe(digestRunId);
      expect(point.evidence.map((item) => item.kind)).toEqual(['section']);
    }
    const child = (await getJson<Envelope<QualityRunDto>>(url, `/runs/${digestRunId}`)).data;
    expect(child.pipeline).toBe('document-digest');
    expect(child.request).toMatchObject({ goal: GOAL, maxIterations: 1, criteriaProvided: false });
    expect(child.trace?.finalDecision).toBe('accept');

    const report = await postJson(url, '/memory/retrieval-report', {
      goal: 'How many years of TypeScript experience does the applicant have, and who was their most recent employer?',
    });
    expect(report.status).toBe(200);
    const retrieval = ((await report.json()) as Envelope<RetrievalReportDto>).data;
    expect(retrieval.store).toMatchObject({ ready: true, chunks: 2 });
    expect(retrieval.candidates.map((candidate) => candidate.runId)).toEqual([
      digestRunId,
      digestRunId,
    ]);
    expect(
      retrieval.candidates.some((candidate) =>
        candidate.text.includes('Senior Software Engineer at Acme from 2020 to 2026'),
      ),
    ).toBe(true);
  });

  it('[QL-70] one stored memory is retracted by its run id and ref, answering what it held, beside the retraction of its whole run; a point address with no ref matches no route', async () => {
    // The two facts the digest above stored, under its run.
    const held = [...store.points.values()];
    expect(held).toHaveLength(2);
    const [first, second] = held;
    expect(second.source.runId).toBe(first.source.runId);
    const { runId, ref } = first.source;
    const retract = async <T>(path: string): Promise<{ status: number; data: T }> => {
      const answer = await fetch(`${url}${path}`, { method: 'DELETE' });
      return { status: answer.status, data: ((await answer.json()) as Envelope<T>).data };
    };

    // A ref that came out empty, or was left off, is no address at all — never the run's.
    for (const path of [`/memory/${runId}/points/`, `/memory/${runId}/points`]) {
      expect((await retract<unknown>(path)).status, path).toBe(404);
    }
    expect([...store.points.values()]).toEqual(held);

    expect(await retract<RetractedMemoryPointDto>(`/memory/${runId}/points/${ref}`)).toEqual({
      status: 200,
      data: { runId, ref, removed: { text: first.text, kind: 'profile_fact', scope: 'subject' } },
    });
    expect([...store.points.values()]).toEqual([second]);
    expect(await retract<RetractedMemoryPointDto>(`/memory/${runId}/points/${ref}`)).toEqual({
      status: 200,
      data: { runId, ref, removed: null },
    });
    // The run's own address is its id alone, and removes what the point route left.
    expect(await retract<RetractedMemoryRunDto>(`/memory/${runId}`)).toEqual({
      status: 200,
      data: { runId, removed: 1 },
    });
    expect(store.points.size).toBe(0);
  });
});
