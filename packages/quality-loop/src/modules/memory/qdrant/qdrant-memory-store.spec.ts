import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectionName, pointId } from './collection';
import { DEFAULT_QDRANT_URL, QdrantMemoryStore } from './qdrant-memory-store';
import { hitOf, vectorOf } from '../testing';

const url = process.env['QDRANT_URL'] || DEFAULT_QDRANT_URL;
const model = `spec-${crypto.randomUUID().slice(0, 8)}`;
const DIMENSIONS = 4;

/** A lesson indexed both ways, as `chunksOf` produces it. */
const chunk = (text: string, runId: string, ref: string) => {
  const hit = hitOf(text, runId, ref);
  const keys = { condition: `when ${text}`, lesson: text };
  return {
    text: hit.text,
    keys,
    contentHash: hit.contentHash,
    source: hit.source,
    evidence: hit.evidence,
    digestRunId: hit.digestRunId,
    model,
    vectors: {
      condition: vectorOf(keys.condition, DIMENSIONS),
      lesson: vectorOf(keys.lesson, DIMENSIONS),
    },
  };
};

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
    await client.deleteCollection(collectionName(model, DIMENSIONS));
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
});
