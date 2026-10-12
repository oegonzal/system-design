import { KNOWLEDGE_ORCHESTRATOR_ID, KNOWLEDGE_STEP_REASONS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../core/contracts';
import { sampleRun } from '../../core/testing';
import { sampleDigest } from '../../pipelines/knowledge-digest/testing';
import { readoutTrace } from '../memory/testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { KNOWLEDGE } from './definition';
import { childRun, knowledgePorts, knowledgeContext, sourceSummary } from './steps.testing';

/**
 * The digest child, judged over the goal it was actually asked — the reader
 * resolves an item's evidence through the index that goal carries, so a stand-in
 * goal would read as a digest nothing could be drawn from.
 */
const digestChild = (goal: string) =>
  childRun(
    'knowledge-digest',
    readoutTrace({
      pipeline: 'knowledge-digest',
      goal,
      artifact: sampleDigest(),
      locations: ['summary', 'memory.1', 'f2', 'r2'],
      criteria: [{ id: 'c1', kind: 'signal', statement: 'accounts for f1 resolving at i2' }],
      results: [
        {
          criterionId: 'c1',
          kind: 'signal',
          result: 'pass',
          hits: 2,
          confidence: 'high',
          locationRefs: ['memory.1'],
        },
      ],
    }),
  );

/**
 * `execute` as the runs service behaves: the child's id reaches the ledger while
 * the step is still running, which is how a reader sees it before it settles.
 */
const digests: Parameters<typeof orchestrationDeps>[1] = (request, onOpened) => {
  const child = digestChild(request.goal);
  onOpened?.(child);
  return Promise.resolve(child);
};

describe('the knowledge orchestrator', () => {
  it('[QL-19] is valid data: four steps over two pipelines, with its own closed reasons', () => {
    expect(() => validateOrchestrator(KNOWLEDGE)).not.toThrow();
    expect(KNOWLEDGE.id).toBe(KNOWLEDGE_ORCHESTRATOR_ID);
    expect(KNOWLEDGE.takesTarget).toBe(true);
    expect(KNOWLEDGE.reasons).toBe(KNOWLEDGE_STEP_REASONS);
    expect(
      KNOWLEDGE.steps.map((step) => [
        step.id,
        typeof step.pipeline === 'function' ? 'chosen' : (step.pipeline ?? null),
        step.needs ?? [],
      ]),
    ).toEqual([
      ['target', 'chosen', []],
      // `known` and `digest` both need the target and nothing else: a store that
      // cannot be searched leaves the digest running with nothing known.
      ['known', null, ['target']],
      ['digest', 'knowledge-digest', ['target']],
      ['store', null, ['digest']],
    ]);
    // Only the target stands in for a provided run: the rest is the learning.
    expect(
      KNOWLEDGE.steps.filter((step) => step.provided !== undefined).map((step) => step.id),
    ).toEqual(['target']);
  });

  it('[QL-43] learns from a run handed in: the target stands in, the rest runs, and the store is written', async () => {
    const source = toRunDto({
      ...childRun('system-design', sampleRun().trace),
      runId: sampleRun().runId,
    });
    const ports = knowledgePorts();
    const record = await performed(
      KNOWLEDGE,
      { pipeline: 'system-design', goal: source.request.goal },
      orchestrationDeps(ports, digests, {
        pipelines: () => [sourceSummary(), summaryOf('knowledge-digest', 75, 'composed')],
      }),
      { provided: source, context: knowledgeContext() as unknown as Record<string, unknown> },
    );

    expect(record.status).toBe('complete');
    expect(
      Object.entries(record.steps).map(([id, step]) => [id, step.status, step.reason]),
    ).toEqual([
      ['target', 'skipped', 'provided-run'],
      ['known', 'complete', null],
      ['digest', 'complete', null],
      ['store', 'complete', null],
    ]);
    // The provided run was never re-run, and the digest opened exactly one child.
    expect(record.steps['target'].runIds).toEqual([source.runId]);
    expect(record.steps['digest'].runIds).toEqual(['knowledge-digest-run']);
    // The digest's one item confirmed a lesson the store already held, so the run
    // reinforced it instead of storing a second copy — which is the whole point
    // of showing the digest what is known. The findings it recorded are its own.
    expect(record.steps['store'].counts).toMatchObject({ items: 0, findings: 1, confirms: 1 });
    expect(await ports.support.bySourceRun(source.runId)).toMatchObject([
      { point: { runId: 'run-known' }, kind: 'confirms', digestRunId: 'knowledge-digest-run' },
    ]);
  });

  it('[QL-43] a store it cannot search costs the delta, not the learning', async () => {
    const source = toRunDto({
      ...childRun('system-design', sampleRun().trace),
      runId: sampleRun().runId,
    });
    const ports = knowledgePorts();
    const record = await performed(
      KNOWLEDGE,
      { pipeline: 'system-design', goal: source.request.goal },
      orchestrationDeps(ports, digests, {
        pipelines: () => [sourceSummary(), summaryOf('knowledge-digest', 75, 'composed')],
      }),
      {
        provided: source,
        context: knowledgeContext({
          store: { ready: true, reason: null, note: null, model: 'm', collection: 'c', chunks: 0 },
        }) as unknown as Record<string, unknown>,
      },
    );
    expect(record.steps['known']).toMatchObject({ status: 'skipped', reason: 'store-empty' });
    // The digest did not need it, so the run still learned something.
    expect(record.steps['digest'].status).toBe('complete');
    expect(record.steps['store'].status).toBe('complete');
    expect(record.status).toBe('complete');
  });

  it('[QL-67] declares the shape of its context and of the two reports its steps make', () => {
    expect(Object.keys(KNOWLEDGE.reports).sort()).toEqual(['digest', 'known']);
    expect(KNOWLEDGE.contextSchema.safeParse({ bogus: true }).success).toBe(false);
    expect(
      KNOWLEDGE.reports.known?.safeParse({
        known: [{ alias: 'k1', runId: 'r', ref: 'f1', kind: 'finding' }],
      }).success,
    ).toBe(true);
    expect(
      KNOWLEDGE.reports.digest?.safeParse({ source: { pipeline: 'p', version: '1.0.0' }, known: 1 })
        .success,
    ).toBe(true);
    expect(
      KNOWLEDGE.reports.digest?.safeParse({ source: { pipeline: 'p' }, known: 1 }).success,
    ).toBe(false);
  });
});
