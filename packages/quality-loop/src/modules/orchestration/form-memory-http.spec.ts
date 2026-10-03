import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import { FIELD_EVIDENCE_HEADING } from '@sysdesign/contracts';
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
import { contentHash } from '../../orchestrators/memory/ports';
import {
  answer,
  fieldGoal,
  policyCriteria,
  sampleAnswers,
} from '../../pipelines/field-answer/testing';
import { bootApp, claimDumpDir, getJson, postJson, type Envelope } from '../http/testing';
import { fakeEmbeddings, InMemoryMemoryStore, vectorOf } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { settledOrchestration } from './testing';

const DUMP_DIR = claimDumpDir('form-memory-http');
const TABLES = [OrchestrationRunChild, OrchestrationRun, QualityRun];
/** The page as the session composes it: five fields, no evidence yet. */
const GOAL = fieldGoal([]);

/** One fact a document-memory run stored earlier, as `chunksOf` shapes a point. */
const storedFact = () => {
  const insight = 'Alex Example has six years of professional Python, 2020–2026, at Acme';
  const condition = 'a form asks how many years of Python experience the applicant has';
  const text = `${insight} — applies when ${condition}`;
  return {
    text,
    keys: { condition, lesson: insight },
    contentHash: contentHash(text),
    source: {
      runId: 'digest-run-1',
      pipeline: 'document-digest',
      kind: 'lesson' as const,
      ref: 'memory.1',
      decision: 'accept' as const,
      iteration: 1,
      when: '2026-10-02',
    },
    evidence: [{ kind: 'section' as const, ref: 'section.2' }],
    digestRunId: 'digest-run-1',
    lineage: null,
    model: 'fake-embedding',
    vectors: { condition: vectorOf(condition), lesson: vectorOf(insight) },
  };
};

/** The page answered over the one fact recalled: only the first field may cite it. */
const answers = () => {
  const sample = sampleAnswers();
  return {
    ...sample,
    fields: sample.fields.map((item) =>
      item.ref === 'e2'
        ? answer('e2', {
            decision: 'ask-operator',
            confidence: 'low',
            reason: 'no evidence states the authorisation',
          })
        : item,
    ),
  };
};

const result = (criterionId: string, locationRefs: string[]) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs,
  rationale: 'as the policy asks',
});

/** Canned answers for the field-answer pipeline alone; the rubric is supplied, so no criteria are canned. */
const CANNED: readonly unknown[] = [
  answers(),
  { findings: [] },
  {
    results: [result('c1', ['field.1']), result('c2', ['field.4']), result('c3', ['summary'])],
    advisoryVerdict: null,
  },
];

describe('the form-memory HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  const store = new InMemoryMemoryStore();

  beforeAll(async () => {
    await ensureDatabase();
    await store.replaceRunChunks('digest-run-1', [storedFact()]);
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

  it('[QL-38] a form page is answered over the facts recalled for its fields: the evidence reaches the run with the supplied rubric, and the target reports its admission', async () => {
    const refused = await postJson(url, '/orchestrations/form-memory', { goal: 'Just a policy.' });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toMatch(
      /carries no field-answer index/,
    );
    const named = await postJson(url, '/orchestrations/form-memory', {
      goal: GOAL,
      pipeline: 'field-answer',
    });
    expect(named.status).toBe(400);

    const criteria = policyCriteria();
    const started = await postJson(url, '/orchestrations/form-memory', { goal: GOAL, criteria });
    expect(started.status).toBe(202);
    const { data } = (await started.json()) as Envelope<{ orchestrationRunId: string }>;
    const record: OrchestrationRunDto = await settledOrchestration(url, data.orchestrationRunId);

    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.request).toMatchObject({ goal: GOAL, criteriaProvided: true, maxIterations: 1 });
    expect(record.context['store']).toMatchObject({ ready: true, chunks: 1 });
    // No model was called for the recall: the fields' labels were the probes.
    expect(record.steps['recall']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: [],
      counts: { probes: 5, candidates: 1, evidence: 1 },
    });
    expect(record.steps['target']).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { iterations: 1 },
      report: { admission: 'admitted' },
    });
    expect(record.steps['target'].runIds).toHaveLength(1);

    const child = (
      await getJson<Envelope<QualityRunDto>>(url, `/runs/${record.steps['target'].runIds[0]}`)
    ).data;
    expect(child.pipeline).toBe('field-answer');
    expect(child.request.criteriaProvided).toBe(true);
    expect(child.request.goal).toContain(FIELD_EVIDENCE_HEADING);
    expect(child.request.goal).toContain(
      '- [m1] Alex Example has six years of professional Python, 2020–2026, at Acme — applies when a form asks how many years of Python experience the applicant has · stored 2026-10-02 · document-digest memory.1 (run digest-run-1)',
    );
    expect(child.trace?.contract.criteria.map((criterion) => criterion.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
    expect(child.trace?.finalDecision).toBe('accept');
    // The rubric was supplied, so the only exchanges are the producer, the two critics and the evaluator — one sample each.
    expect(child.exchanges.map((exchange) => exchange.scope).sort()).toEqual([
      'critic.form.s1',
      'critic.grounding.s1',
      'evaluator.answers.s1',
      'producer',
    ]);
  });
});
