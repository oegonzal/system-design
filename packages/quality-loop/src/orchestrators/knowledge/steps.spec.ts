import { describe, expect, it } from 'vitest';

import { sampleRun } from '../../core/testing';
import {
  fakeEmbeddings,
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  mutedEmbeddings,
} from '../../modules/memory/testing';
import { CachedEmbeddings } from '../memory/embeddings';
import { KNOWN_HEADING } from '../../pipelines/knowledge-digest/input';
import { sampleDigest } from '../../pipelines/knowledge-digest/testing';
import { readoutTrace } from '../memory/testing';
import { digest, known, store } from './steps';
import { childRun, knowledgePorts, sourceSummary, stepContext, KNOWN_TEXT } from './steps.testing';

const source = () => sampleRun();
const traceOf = () => {
  const run = sampleRun();
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

/** A knowledge-digest child run that endorses the sample item. */
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

describe('the knowledge orchestrator’s steps', () => {
  it('[QL-43] `known` asks the store about the run’s own evidence and reports what came back', async () => {
    const ctx = stepContext(null, { outputs: { target: source() } });
    const result = await known(ctx);
    expect(result.status).toBe('complete');
    expect(result.counts).toMatchObject({ probes: 3 });
    // No model was called: the probes are the run's evidence as the engine wrote it.
    expect(ctx.executed).toEqual([]);
    expect((result.counts?.known ?? 0) > 0).toBe(true);
    const reported = result.report as { known: { alias: string; runId: string; kind: string }[] };
    expect(reported.known[0].alias).toBe('k1');
    // Never the run's own points, and never a finding chunk.
    expect(reported.known.every((item) => item.runId !== source().runId)).toBe(true);
    expect(reported.known.every((item) => item.kind !== 'finding')).toBe(true);
  });

  it('[QL-43] `known` skips with the reason when it cannot search, and the digest still runs', async () => {
    const empty = stepContext(null, {
      outputs: { target: source() },
      context: {
        store: { ready: true, reason: null, note: null, model: 'm', collection: 'c', chunks: 0 },
      },
    });
    expect(await known(empty)).toMatchObject({ status: 'skipped', reason: 'store-empty' });

    const off = stepContext(null, {
      outputs: { target: source() },
      ports: {
        // The note is the client's own reason, read from the ports rather than
        // from what the orchestration observed at open.
        embedding: { enabled: false, model: null, reason: 'no-key' },
        embeddings: new CachedEmbeddings(
          { ...fakeEmbeddings(), enabled: false, model: null },
          new InMemoryEmbeddingCache(),
        ),
      },
      context: { embedding: { enabled: false, model: null, reason: 'no-key' } },
    });
    expect(await known(off)).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
      note: 'no-key',
    });

    // Enabled but answering nothing is a failure, not a skip: the search was
    // possible and the provider lost it.
    const muted = stepContext(null, {
      outputs: { target: source() },
      ports: { embeddings: mutedEmbeddings() },
    });
    expect(await known(muted)).toMatchObject({
      status: 'failed',
      reason: 'embedding-failed',
      counts: { probes: 3 },
    });

    const bare = stepContext(null, {
      outputs: {
        target: {
          ...source(),
          trace: {
            ...traceOf(),
            iterations: [
              {
                ...traceOf().iterations[1],
                ledger: { ...traceOf().iterations[1].ledger, findings: [], criteria: [] },
              },
            ],
            bestIteration: 2,
          },
        },
      },
    });
    expect(await known(bare)).toMatchObject({ status: 'skipped', reason: 'no-probes' });

    expect(await known(stepContext(null, {}))).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'target',
    });
  });

  it('[QL-43] `digest` shows the record what is known, and reads back the typed items', async () => {
    const ports = knowledgePorts();
    const hits = await ports.store.searchMany([
      { vector: [1, 0, 0, 0, 0, 0, 0, 0], using: 'lesson', limit: 2 },
    ]);
    const ctx = stepContext(
      (): ReturnType<typeof digestChild> => digestChild(ctx.executed.at(-1)?.goal ?? ''),
      {
        outputs: { target: source(), known: { known: hits[0] } },
        ports: { store: ports.store },
      },
    );
    const result = await digest(ctx);
    expect(result.status).toBe('complete');
    // The record the digest read carries the known section and the dimension map.
    const [asked] = ctx.executed;
    expect(asked.goal).toContain(KNOWN_HEADING);
    expect(asked.goal).toContain('dimension is exactly one of');
    expect(result.report).toMatchObject({
      source: { pipeline: 'system-design', version: '1.0.0' },
    });
    expect(result.counts).toMatchObject({ items: 1, kept: 1 });
    expect(result.output?.items[0].kind).toBe('procedure');
    expect(result.output?.dimensions.findingTypes['unhandled_failure']).toBe('soundness');
  });

  it('[QL-43] `digest` says why it did nothing: no pipeline, no policy, nothing settled, or never judged', async () => {
    const unregistered = stepContext(null, { outputs: { target: source() }, acceptAt: null });
    expect(await digest(unregistered)).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
    });

    const noPolicy = stepContext(null, { outputs: { target: source() }, registry: [] });
    expect(await digest(noPolicy)).toMatchObject({
      status: 'skipped',
      reason: 'source-pipeline-unknown',
      note: 'system-design',
    });

    const running = stepContext(null, {
      outputs: { target: { ...source(), trace: { ...traceOf(), stopReason: null } } },
    });
    expect(await digest(running)).toMatchObject({ status: 'skipped', reason: 'nothing-to-digest' });

    // A digest the policy would not admit endorses nothing, and says so as a verdict.
    const shortfall = stepContext(
      (): ReturnType<typeof digestChild> =>
        childRun(
          'knowledge-digest',
          readoutTrace({
            pipeline: 'knowledge-digest',
            goal: 'g',
            artifact: sampleDigest(),
            locations: ['summary', 'memory.1'],
            criteria: [{ id: 'c1', kind: 'signal', statement: 's' }],
            decision: 'revise',
            overall: 10,
          }),
        ),
      { outputs: { target: source() }, registry: [sourceSummary()] },
    );
    expect(await digest(shortfall)).toMatchObject({
      status: 'complete',
      reason: 'not-accepted',
      counts: { kept: 0 },
    });
  });

  it('[QL-43] `store` writes what the digest endorsed, and says when it cannot', async () => {
    const ports = knowledgePorts();
    const digested = {
      digestRunId: 'digest-run',
      items: [
        {
          position: 1,
          insight: 'Name a durable queue between an unreliable upstream and the read path.',
          appliesWhen: 'a requirement is served from data an unreliable system provides',
          evidence: [{ kind: 'finding' as const, ref: 'unhandled_failure|flow.1' }],
          iterations: [],
          kind: 'procedure' as const,
          polarity: 'do' as const,
          dimension: 'soundness',
          topics: ['upstream-outage'],
          confirms: [],
          contradicts: [],
          storable: true,
        },
      ],
      dimensions: { criterionKinds: {}, findingTypes: { unhandled_failure: 'soundness' } },
      unresolved: 0,
    };
    const ctx = stepContext(null, {
      outputs: { target: source(), digest: digested },
      ports: { store: ports.store, support: ports.support },
    });
    expect(await store(ctx)).toMatchObject({ status: 'complete', counts: { items: 1 } });
    expect(
      [...(ctx.ports.store as InMemoryMemoryStore).points.values()].some(
        (chunk) => chunk.source.ref === 'knowledge.1',
      ),
    ).toBe(true);

    const down = stepContext(null, {
      outputs: { target: source(), digest: digested },
      context: {
        store: {
          ready: false,
          reason: 'unreachable',
          note: 'down',
          model: 'm',
          collection: 'c',
          chunks: 0,
        },
      },
    });
    expect(await store(down)).toMatchObject({
      status: 'skipped',
      reason: 'store-unavailable',
      note: 'down',
    });

    expect(await store(stepContext(null, { outputs: { target: source() } }))).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'digest',
    });
  });

  it('[QL-43] the knowledge the digest read is never the memory a run was handed', async () => {
    const ports = knowledgePorts();
    const ctx = stepContext(
      (): ReturnType<typeof digestChild> => digestChild(ctx.executed.at(-1)?.goal ?? ''),
      {
        outputs: {
          target: {
            ...source(),
            trace: {
              ...traceOf(),
              contract: {
                ...traceOf().contract,
                goal: `${traceOf().contract.goal}\n\n## Remembered evidence (advisory)\n\n- [m1] ${KNOWN_TEXT}`,
              },
            },
          },
        },
        ports: { store: ports.store },
      },
    );
    await digest(ctx);
    // The digest judges the bare prompt: remembered evidence is never re-digested.
    expect(ctx.executed[0].goal).not.toContain('Remembered evidence');
  });
});
