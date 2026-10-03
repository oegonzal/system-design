import { describe, expect, it } from 'vitest';

import { sampleRun } from '../../../core/testing';
import { describePipeline } from '../../../core/pipeline';
import { SYSTEM_DESIGN } from '../../../pipelines/system-design/definition';
import { InMemoryMemoryStore } from '../../../modules/memory/testing';
import { contentHash } from '../../memory/ports';
import { originOf } from '../../memory/store/index-memories';
import type { KnowledgeToStore } from '../digest/read-knowledge-digest';
import { InMemorySupportStore, knowledgePorts, storedLesson } from '../steps.testing';
import { dimensionMapOf } from './chunks';
import { claimsOf, indexKnowledge, OWNED_KINDS } from './index-knowledge';

const KNOWN = { runId: 'run-known', ref: 'memory.1' };
const KNOWN_TEXT = 'Give every read path that depends on an upstream a story for it being down';

const traceOf = () => {
  const run = sampleRun();
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

const item = (overrides: Partial<KnowledgeToStore> = {}): KnowledgeToStore => ({
  position: 1,
  insight: 'Name a durable queue between an unreliable upstream and the read path.',
  appliesWhen: 'a functional requirement is served from data an unreliable system provides',
  evidence: [{ kind: 'finding', ref: 'unhandled_failure|flow.1' }],
  kind: 'procedure',
  polarity: 'do',
  dimension: 'soundness',
  topics: ['upstream-outage'],
  confirms: [],
  contradicts: [],
  storable: true,
  iterations: [],
  ...overrides,
});

const writing = (items: KnowledgeToStore[]) => {
  const run = sampleRun();
  const trace = traceOf();
  return {
    source: run,
    trace,
    digestRunId: 'digest-run',
    items,
    dimensions: dimensionMapOf(describePipeline(SYSTEM_DESIGN as never).policy),
    origin: originOf(run, trace),
    model: 'fake-embedding',
    unresolved: 0,
  };
};

const points = (ports: ReturnType<typeof knowledgePorts>) => [
  ...(ports.store as InMemoryMemoryStore).points.values(),
];

describe('writing what a run was found to teach', () => {
  it('[QL-44] writes the items and the findings, and replaces only the kinds it owns', async () => {
    const ports = knowledgePorts();
    const store = ports.store as InMemoryMemoryStore;
    const run = sampleRun();
    // A lesson the memory orchestrator keeps under the same source run id.
    void store.replaceRunChunks(
      run.runId,
      [storedLesson('an older lesson', run.runId, 'memory.9')],
      {
        kinds: ['lesson'],
      },
    );

    const written = await indexKnowledge(ports, writing([item()]));
    expect(written).toMatchObject({
      status: 'complete',
      counts: { items: 1, findings: 1, chunks: 2, confirms: 0, contradicts: 0, conflicting: 0 },
    });
    expect(OWNED_KINDS).not.toContain('lesson');
    const mine = points(ports).filter((chunk) => chunk.source.runId === run.runId);
    expect(mine.map((chunk) => [chunk.source.kind, chunk.source.ref]).sort()).toEqual([
      ['finding', 'finding.1'],
      ['lesson', 'memory.9'],
      ['procedure', 'knowledge.1'],
    ]);
  });

  it('[QL-44] an item that confirms is a row rather than a point, and the count reaches the point it names', async () => {
    const ports = knowledgePorts();
    const support = ports.support as InMemorySupportStore;
    const confirming = item({
      storable: false,
      confirms: [{ point: KNOWN, contentHash: contentHash(KNOWN_TEXT) }],
    });
    const written = await indexKnowledge(ports, writing([confirming]));
    expect(written).toMatchObject({ status: 'complete', counts: { items: 0, confirms: 1 } });

    // No point of its own: what it teaches is already stored.
    expect(points(ports).some((chunk) => chunk.source.kind === 'procedure')).toBe(false);
    const rows = await support.bySourceRun(sampleRun().runId);
    expect(rows).toEqual([
      {
        point: KNOWN,
        contentHash: contentHash(KNOWN_TEXT),
        kind: 'confirms',
        digestRunId: 'digest-run',
      },
    ]);
    // And the count a search reads is on the point the claim names.
    const known = points(ports).find((chunk) => chunk.source.ref === 'memory.1');
    expect(known?.facets?.support).toEqual({ confirms: 1, contradicts: 0 });
  });

  it('[QL-44] running it twice over one run leaves the points, the rows and the counts as they were', async () => {
    const ports = knowledgePorts();
    const support = ports.support as InMemorySupportStore;
    const confirming = item({
      storable: false,
      confirms: [{ point: KNOWN, contentHash: contentHash(KNOWN_TEXT) }],
    });
    await indexKnowledge(ports, writing([confirming, item({ position: 2 })]));
    const first = {
      points: points(ports)
        .map((chunk) => `${chunk.source.runId}|${chunk.source.ref}`)
        .sort(),
      rows: (await support.bySourceRun(sampleRun().runId)).length,
      support: points(ports).find((chunk) => chunk.source.ref === 'memory.1')?.facets?.support,
    };

    await indexKnowledge(ports, writing([confirming, item({ position: 2 })]));
    expect(
      points(ports)
        .map((chunk) => `${chunk.source.runId}|${chunk.source.ref}`)
        .sort(),
    ).toEqual(first.points);
    expect(await support.bySourceRun(sampleRun().runId)).toHaveLength(first.rows);
    expect(points(ports).find((chunk) => chunk.source.ref === 'memory.1')?.facets?.support).toEqual(
      first.support,
    );
  });

  it('[QL-44] a claim that says both things about one item is dropped and counted, and one row per run per point', () => {
    const both = item({
      confirms: [{ point: KNOWN, contentHash: 'h' }],
      contradicts: [{ point: KNOWN, contentHash: 'h' }],
    });
    expect(claimsOf([both], 'digest-run')).toEqual({ rows: [], conflicting: 1 });

    // Two items of one digest naming the same point agree: the row is written once.
    const twice = [
      item({ confirms: [{ point: KNOWN, contentHash: 'h' }] }),
      item({ position: 2, confirms: [{ point: KNOWN, contentHash: 'h' }] }),
    ];
    expect(claimsOf(twice, 'digest-run').rows).toHaveLength(1);
  });

  it('[QL-44] the points stand when the rows cannot be written, and the reason says which', async () => {
    const support = new InMemorySupportStore();
    support.replace = () => Promise.reject(new Error('rows are down'));
    const ports = knowledgePorts({ support });
    const written = await indexKnowledge(
      ports,
      writing([item({ confirms: [{ point: KNOWN, contentHash: contentHash(KNOWN_TEXT) }] })]),
    );
    expect(written).toMatchObject({
      status: 'failed',
      reason: 'support-unavailable',
      note: 'rows are down',
    });
    // The points landed: the rows are the truth and the counts are recomputed later.
    expect(points(ports).some((chunk) => chunk.source.kind === 'finding')).toBe(true);
  });
});
