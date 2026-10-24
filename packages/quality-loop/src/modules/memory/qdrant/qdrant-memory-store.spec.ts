import { QdrantClient } from '@qdrant/js-client-rest';
import type { MemoryScope } from '@sysdesign/contracts';
import { DEFAULT_QDRANT_URL } from '@sysdesign/qdrant-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectionName, INDEXED_FIELDS, pointId, toPayload } from './collection';
import { QdrantMemoryStore } from './qdrant-memory-store';
import type { MemoryHit, MemoryProbe } from '../../../orchestrators/memory/ports';
import { hitOf } from '../../../orchestrators/memory/testing';
import { chunkSourceSchema } from '../../../pipelines/memory-recall/input';
import { InMemoryMemoryStore, storedChunkOf } from '../testing';

const url = process.env['QDRANT_URL'] || DEFAULT_QDRANT_URL;
const model = `spec-${crypto.randomUUID().slice(0, 8)}`;
/** A second throwaway collection, holding only what the unit-of-work case seeds. */
const unitsModel = `${model}-units`;
const DIMENSIONS = 4;

/** A lesson indexed both ways, as `chunksOf` produces it. */
const chunk = (text: string, runId: string, ref: string) =>
  storedChunkOf({ ...hitOf(text, runId, ref), model }, DIMENSIONS);

describe('the Qdrant memory store', () => {
  const client = new QdrantClient({ url, checkCompatibility: false });
  const store = new QdrantMemoryStore(client, model, DIMENSIONS);

  beforeAll(async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await client.getCollections();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`qdrant not reachable at ${url}`);
  });

  afterAll(async () => {
    for (const name of [model, unitsModel].map((each) => collectionName(each, DIMENSIONS))) {
      if ((await client.collectionExists(name)).exists) await client.deleteCollection(name);
    }
  });

  it('[QL-17] binds a collection to the model and width, replaces a run idempotently, and searches with payload round trip', async () => {
    expect(await store.verify()).toEqual({
      ready: true,
      reason: null,
      note: null,
      model,
      collection: collectionName(model, DIMENSIONS),
      chunks: 0,
    });

    const first = chunk('serve the list from a store the page owns', 'run-a', 'memory.1');
    const second = chunk('record each status transition as a row', 'run-a', 'memory.2');
    expect(await store.replaceRunChunks('run-a', [first, second])).toBe(2);
    expect(await store.replaceRunChunks('run-a', [first, second])).toBe(2);
    expect((await store.verify()).chunks).toBe(2);
    expect(pointId('run-a', 'memory.1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const [byCondition, byLesson] = await store.searchMany([
      { vector: first.vectors.condition, using: 'condition', limit: 5 },
      { vector: first.vectors.lesson, using: 'lesson', limit: 5 },
    ]);
    // Each named vector is searched independently and answers in probe order.
    expect(byCondition[0].contentHash).toBe(first.contentHash);
    const hits = byLesson;
    expect(hits[0]).toMatchObject({
      text: first.text,
      contentHash: first.contentHash,
      source: first.source,
      evidence: first.evidence,
      digestRunId: null,
      model,
    });
    expect(hits[0].score).toBeGreaterThan(hits[1]?.score ?? -1);

    // The same lesson from another run is one candidate, not two.
    await store.replaceRunChunks('run-b', [chunk(first.text, 'run-b', 'memory.1')]);
    const [deduped] = await store.searchMany([
      { vector: first.vectors.lesson, using: 'lesson', limit: 5 },
    ]);
    expect(deduped.filter((hit) => hit.text === first.text)).toHaveLength(1);
    expect((await store.verify()).chunks).toBe(3);

    expect(await store.replaceRunChunks('run-a', [])).toBe(0);
    expect((await store.verify()).chunks).toBe(1);
  });

  it('[QL-41] narrows a probe by kind and run, replaces only the kinds a writer owns, and sets support', async () => {
    const lesson = chunk('shard the write path before the read path', 'run-d', 'memory.1');
    const fact = {
      ...chunk(
        'a partitioned unique key must include the partition column',
        'run-d',
        'knowledge.1',
      ),
      source: {
        ...lesson.source,
        ref: 'knowledge.1',
        kind: 'fact' as const,
        pipeline: 'knowledge-digest',
      },
      facets: { dimension: 'soundness', polarity: 'avoid' as const, topics: ['partitioning'] },
    };
    expect(await store.replaceRunChunks('run-d', [lesson, fact])).toBe(2);

    // The facets survive the round trip through the real payload.
    const [anything] = await store.searchMany([
      { vector: fact.vectors.lesson, using: 'lesson', limit: 5 },
    ]);
    expect(anything.find((hit) => hit.source.ref === 'knowledge.1')?.facets).toEqual(fact.facets);

    // Each field of the filter narrows: by kind, by pipeline, and away from a run.
    const [kinds, pipelines, notRun] = await store.searchMany([
      {
        vector: fact.vectors.lesson,
        using: 'lesson',
        limit: 5,
        filter: { kinds: ['fact', 'pattern'] },
      },
      {
        vector: fact.vectors.lesson,
        using: 'lesson',
        limit: 5,
        filter: { pipelines: ['knowledge-digest'] },
      },
      { vector: fact.vectors.lesson, using: 'lesson', limit: 5, filter: { notRunIds: ['run-d'] } },
    ]);
    expect(kinds.map((hit) => hit.source.kind)).toEqual(['fact']);
    expect(pipelines.map((hit) => hit.source.ref)).toEqual(['knowledge.1']);
    expect(notRun.every((hit) => hit.source.runId !== 'run-d')).toBe(true);

    // A writer that owns one kind replaces its own points and leaves the rest.
    expect(await store.replaceRunChunks('run-d', [], { kinds: ['lesson'] })).toBe(0);
    const [survivors] = await store.searchMany([
      { vector: fact.vectors.lesson, using: 'lesson', limit: 5, filter: { notRunIds: [] } },
    ]);
    expect(
      survivors.filter((hit) => hit.source.runId === 'run-d').map((hit) => hit.source.ref),
    ).toEqual(['knowledge.1']);

    // Support is set on a point that stands; one that has gone is left alone.
    await store.setSupport([
      { point: { runId: 'run-d', ref: 'knowledge.1' }, support: { confirms: 2, contradicts: 1 } },
      { point: { runId: 'run-d', ref: 'memory.1' }, support: { confirms: 9, contradicts: 9 } },
    ]);
    const [supported] = await store.searchMany([
      { vector: fact.vectors.lesson, using: 'lesson', limit: 5, filter: { kinds: ['fact'] } },
    ]);
    expect(supported[0].facets).toEqual({
      ...fact.facets,
      support: { confirms: 2, contradicts: 1 },
    });
    expect(await store.replaceRunChunks('run-d', [], { kinds: ['fact'] })).toBe(0);
  });

  it('[QL-41] has an index on the server for every field a filter may narrow by', async () => {
    // Existence only, deliberately. Comparing the reported type against the
    // declared one is circular — the server reports back whatever `ensure`
    // asked for, so a wrong declaration agrees with itself. That the declared
    // type suits the value the payload holds is checked against the payload, in
    // `collection.spec.ts`.
    await store.verify();
    const described = await client.getCollection(collectionName(model, DIMENSIONS));
    const reported = described.payload_schema ?? {};
    const fields = Object.keys(INDEXED_FIELDS);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(reported[field], `no index on the server for ${field}`).toBeDefined();
    }
  });

  it('[QL-17] reports an unreachable server and a missing model as data, never as a throw at boot', async () => {
    const dark = new QdrantMemoryStore(
      new QdrantClient({ url: 'http://127.0.0.1:1', checkCompatibility: false, timeout: 500 }),
      model,
      DIMENSIONS,
    );
    const dark_ = await dark.verify();
    expect(dark_).toMatchObject({ ready: false, reason: 'unreachable', chunks: 0 });
    expect(dark_.note).toBeTruthy();
    const unbound = new QdrantMemoryStore(client, null, DIMENSIONS);
    expect(await unbound.verify()).toEqual({
      ready: false,
      reason: 'no-model',
      note: null,
      model: null,
      collection: null,
      chunks: 0,
    });
  });
  it('[QL-70] retracts every point of a run by its id and nothing else; a run never stored removes nothing', async () => {
    const before = (await store.verify()).chunks;
    await store.replaceRunChunks('run-r1', [
      chunk('cache the listing by its filter key', 'run-r1', 'memory.1'),
      chunk('expire the cache on every write to the list', 'run-r1', 'memory.2'),
    ]);
    await store.replaceRunChunks('run-r2', [
      chunk('read the listing through one query per page', 'run-r2', 'memory.1'),
    ]);
    expect((await store.verify()).chunks).toBe(before + 3);

    expect(await store.retractRun('run-r1')).toBe(2);
    expect((await store.verify()).chunks).toBe(before + 1);
    expect(await store.retractRun('run-r1')).toBe(0);
    expect(await store.retractRun('run-r2')).toBe(1);
    expect((await store.verify()).chunks).toBe(before);
  });
  it('[QL-70] retracts one point by its run and ref and answers it as stored; its run’s other point and another run’s same ref stand, and a point never stored removes nothing', async () => {
    const before = (await store.verify()).chunks;
    const corrected = {
      ...chunk('page the listing by its last key', 'run-p1', 'memory.1'),
      scope: 'unit' as const,
    };
    await store.replaceRunChunks('run-p1', [
      corrected,
      chunk('index the listing by its filter key', 'run-p1', 'memory.2'),
    ]);
    await store.replaceRunChunks('run-p2', [
      chunk('page the listing by an offset', 'run-p2', 'memory.1'),
    ]);
    expect((await store.verify()).chunks).toBe(before + 3);

    // The memory as stored — read back through the payload, never its vectors or keys.
    expect(await store.retractPoint({ runId: 'run-p1', ref: 'memory.1' })).toEqual({
      status: 'removed',
      memory: {
        text: corrected.text,
        contentHash: corrected.contentHash,
        model,
        evidence: corrected.evidence,
        digestRunId: null,
        lineage: null,
        source: corrected.source,
        scope: 'unit',
      },
    });
    expect((await store.verify()).chunks).toBe(before + 2);
    expect(await store.retractPoint({ runId: 'run-p1', ref: 'memory.1' })).toEqual({
      status: 'not-held',
    });
    expect(await store.retractPoint({ runId: 'run-p3', ref: 'memory.1' })).toEqual({
      status: 'not-held',
    });
    expect((await store.verify()).chunks).toBe(before + 2);

    // What stands is the run's other point and the other run's point under the same ref.
    expect(await store.retractRun('run-p1')).toBe(1);
    expect(await store.retractRun('run-p2')).toBe(1);
    expect((await store.verify()).chunks).toBe(before);
  });
  it('[QL-70] leaves a point it cannot read where it stands, and answers it as held but unreadable, never as a point it does not hold', async () => {
    const before = (await store.verify()).chunks;
    const collection = collectionName(model, DIMENSIONS);
    const written = chunk('page the listing by its cursor', 'run-u1', 'memory.1');
    const id = pointId('run-u1', 'memory.1');
    // What a newer build might write: the payload this one writes, plus a key it does not declare.
    const payload = { ...toPayload(written, '2026-10-13T00:00:00.000Z'), writtenLater: true };
    await client.upsert(collection, {
      wait: true,
      points: [{ id, vector: written.vectors, payload }],
    });
    expect((await store.verify()).chunks).toBe(before + 1);

    expect(await store.retractPoint({ runId: 'run-u1', ref: 'memory.1' })).toEqual({
      status: 'unreadable',
    });
    // Nothing removed: the point stands at its id with the payload it was written with.
    expect((await store.verify()).chunks).toBe(before + 1);
    const standing = (await client.retrieve(collection, { ids: [id], with_payload: true })).at(0);
    expect(standing?.payload).toEqual(payload);

    expect(await store.retractRun('run-u1')).toBe(1);
    expect((await store.verify()).chunks).toBe(before);
  });
  it('[QL-69] [QL-70] [QL-71] the in-memory store answers a search and a retraction as this adapter does: the memory without its keys or vectors, with its scope, its unit and its facets', async () => {
    const fake = new InMemoryMemoryStore(model, DIMENSIONS);
    const written = chunk('the subject works on the orders team', 'run-f1', 'memory.1');
    const fact = {
      ...written,
      source: { ...written.source, pipeline: 'document-digest', kind: 'profile_fact' as const },
      evidence: [{ kind: 'section' as const, ref: 'section.1' }],
      digestRunId: 'run-f1',
      scope: 'unit' as const,
      unitKey: 'U',
      facets: { topics: ['employment'] },
    };
    for (const each of [store, fake]) await each.replaceRunChunks('run-f1', [fact]);

    // A search naming the fact's unit: the same hit from both, but for each store's own cosine.
    const probe = {
      vector: fact.vectors.lesson,
      using: 'lesson' as const,
      limit: 1,
      filter: { kinds: ['profile_fact' as const], unitKey: 'U' },
    };
    const adapted = (await store.searchMany([probe]))[0].at(0);
    const faked = (await fake.searchMany([probe]))[0].at(0);
    expect(adapted).toMatchObject({
      text: fact.text,
      scope: 'unit',
      unitKey: 'U',
      facets: fact.facets,
    });
    expect({ ...faked, score: 0 }).toStrictEqual({ ...adapted, score: 0 });
    expect(faked?.score).toBeCloseTo(adapted?.score ?? Number.NaN, 5);

    // A retraction: the same answer from both, then the same miss.
    const point = { runId: 'run-f1', ref: 'memory.1' };
    const removed = await store.retractPoint(point);
    expect(removed.status).toBe('removed');
    expect(await fake.retractPoint(point)).toStrictEqual(removed);
    expect(await fake.retractPoint(point)).toStrictEqual(await store.retractPoint(point));
  });

  it('[QL-71] reads a memory bound to a unit of work only for a search naming its unit, refilling the slots it leaves inside the filter, and the in-memory store answers each such search with the same whole hits', async () => {
    const units = new QdrantMemoryStore(client, unitsModel, DIMENSIONS);
    const fake = new InMemoryMemoryStore(unitsModel, DIMENSIONS);
    // The three memories no search naming none may read sit closest to the probe, so a
    // filter applied after the fetch would leave a one-hit search with nothing.
    const probe = [1, 0, 0, 0];
    const at = (vector: number[]) => ({ condition: vector, lesson: vector });
    const fact = (
      runId: string,
      ref: string,
      vector: number[],
      held: { scope: MemoryScope; unitKey?: string },
    ) => {
      const written = chunk(`fact ${runId} ${ref}`, runId, ref);
      return {
        ...written,
        source: { ...written.source, pipeline: 'document-digest', kind: 'profile_fact' as const },
        evidence: [{ kind: 'section' as const, ref: 'section.1' }],
        digestRunId: runId,
        vectors: at(vector),
        ...held,
      };
    };
    const lesson = chunk('page the listing by its last key', 'run-l', 'memory.1');
    const seeded = {
      'run-l': [{ ...lesson, vectors: at([0.1, 1, 0, 0]) }],
      'run-s': [fact('run-s', 'memory.1', [0.05, 0, 1, 0], { scope: 'subject' })],
      'run-u': [
        fact('run-u', 'memory.1', [1, 0, 0, 0], { scope: 'unit', unitKey: 'U' }),
        fact('run-u', 'memory.2', [0.99, 0.1, 0, 0], { scope: 'unit', unitKey: 'V' }),
        fact('run-u', 'memory.3', [0.98, 0, 0.2, 0], { scope: 'unit' }),
      ],
    };
    for (const each of [units, fake]) {
      for (const [runId, chunks] of Object.entries(seeded)) {
        await each.replaceRunChunks(runId, chunks);
      }
    }
    const search = (limit: number, filter?: MemoryProbe['filter']): MemoryProbe => ({
      vector: probe,
      using: 'lesson',
      limit,
      ...(filter === undefined ? {} : { filter }),
    });
    const probes = [
      search(10, { unitKey: 'U' }),
      search(10),
      search(10, { unitKey: 'U', notRunIds: ['run-s'] }),
      search(1),
    ];
    const adapted = await units.searchMany(probes);
    const faked = await fake.searchMany(probes);
    const named = (hits: readonly MemoryHit[]) =>
      hits.map((hit) => `${hit.source.runId}|${hit.source.ref}`).sort();
    expect(adapted.slice(0, 3).map(named)).toEqual([
      ['run-l|memory.1', 'run-s|memory.1', 'run-u|memory.1'],
      ['run-l|memory.1', 'run-s|memory.1'],
      ['run-l|memory.1', 'run-u|memory.1'],
    ]);
    // A one-hit search naming none is answered with one hit, though three it may not read rank above it.
    expect(named(adapted[3] ?? [])).toEqual(['run-l|memory.1']);
    // Whole hits, the score aside: the fake mirrors the adapter on every search.
    const whole = (hits: readonly MemoryHit[]) =>
      [...hits]
        .sort(
          (a, b) =>
            a.source.ref.localeCompare(b.source.ref) ||
            a.source.runId.localeCompare(b.source.runId),
        )
        .map(({ score, ...hit }) => {
          void score;
          return hit;
        });
    expect(faked.map(whole)).toStrictEqual(adapted.map(whole));
    // A hit's source is exactly the recall pipeline's own shape: the unit rides beside it.
    for (const hit of adapted.flat()) {
      expect(Object.keys(hit.source).sort()).toEqual(Object.keys(chunkSourceSchema.shape).sort());
    }
  });
});
