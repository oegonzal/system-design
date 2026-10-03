import type { QdrantClient } from '@qdrant/js-client-rest';
import { describe, expect, it } from 'vitest';

import { INDEXED_FIELDS } from './collection';
import { QdrantMemoryStore } from './qdrant-memory-store';

/**
 * A client that remembers what it was asked, over a collection that may or
 * may not exist and carries the payload indexes it was built with. The
 * store's reconciliation is what is under test, so no server is involved.
 */
function fakeClient(exists: boolean, indexed: readonly string[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    <T>(method: string, answer: T) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(answer);
    };
  const client = {
    collectionExists: record('collectionExists', { exists }),
    createCollection: record('createCollection', true),
    getCollection: record('getCollection', {
      payload_schema: Object.fromEntries(
        indexed.map((field) => [field, { data_type: 'keyword', points: 0 }]),
      ),
    }),
    createPayloadIndex: record('createPayloadIndex', { status: 'acknowledged' }),
    count: record('count', { count: 0 }),
  };
  return { calls, client: client as unknown as QdrantClient };
}

const indexedBy = (calls: { method: string; args: unknown[] }[]): string[] =>
  calls
    .filter((call) => call.method === 'createPayloadIndex')
    .map((call) => (call.args[1] as { field_name: string }).field_name);

describe('the Qdrant store’s payload indexes', () => {
  it('[QL-43] adds the lineage indexes to a collection built before them, once per process, and leaves one that has them alone', async () => {
    const earlier = fakeClient(true, ['runId', 'pipeline', 'kind']);
    const store = new QdrantMemoryStore(earlier.client, 'm', 4);
    expect((await store.verify()).ready).toBe(true);
    expect(earlier.calls.map((call) => call.method)).not.toContain('createCollection');
    expect(indexedBy(earlier.calls)).toEqual([
      'lineage.judged.runId',
      'lineage.adoptedFrom.runId',
      'lineage.goalHash',
    ]);
    await store.verify();
    expect(indexedBy(earlier.calls)).toHaveLength(3);

    const current = fakeClient(true, INDEXED_FIELDS);
    await new QdrantMemoryStore(current.client, 'm', 4).verify();
    expect(indexedBy(current.calls)).toEqual([]);
  });

  it('[QL-43] builds a new collection with every declared index', async () => {
    const fresh = fakeClient(false, []);
    await new QdrantMemoryStore(fresh.client, 'm', 4).verify();
    expect(fresh.calls.map((call) => call.method)).toContain('createCollection');
    expect(indexedBy(fresh.calls)).toEqual([...INDEXED_FIELDS]);
  });
});
