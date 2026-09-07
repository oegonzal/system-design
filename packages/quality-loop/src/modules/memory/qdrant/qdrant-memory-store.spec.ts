import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectionName, pointId } from './collection';
import { QdrantMemoryStore } from './qdrant-memory-store';
import { hitOf, vectorOf } from '../testing';

const url = process.env['QDRANT_URL'] ?? 'http://localhost:6333';
const model = `spec-${crypto.randomUUID().slice(0, 8)}`;
const DIMENSIONS = 4;

const chunk = (text: string, runId: string, ref: string) => {
  const hit = hitOf(text, runId, ref);
  return {
    text: hit.text,
    contentHash: hit.contentHash,
    source: hit.source,
    evidence: hit.evidence,
    digestRunId: hit.digestRunId,
    model,
    vector: vectorOf(text, DIMENSIONS),
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

    const hits = await store.search(first.vector, 5);
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
    const deduped = await store.search(first.vector, 5);
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
    expect(await dark.verify()).toMatchObject({ ready: false, reason: 'unreachable', chunks: 0 });
    const unbound = new QdrantMemoryStore(client, null, DIMENSIONS);
    expect(await unbound.verify()).toEqual({
      ready: false,
      reason: 'no-model',
      model: null,
      collection: null,
      chunks: 0,
    });
  });
});
