import type { QdrantClient } from '@qdrant/js-client-rest';
import { describe, expect, it } from 'vitest';

import { INDEXED_FIELDS } from './collection';
import { QdrantMemoryStore } from './qdrant-memory-store';

/**
 * A client that remembers what it was asked, over a collection that may or
 * may not exist, and that refuses an index on the fields it is told to. The
 * store's own `ensure` is what is under test, so no server is involved.
 */
function fakeClient(exists: boolean, refused: readonly string[] = []) {
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
    createPayloadIndex: (...args: unknown[]) => {
      calls.push({ method: 'createPayloadIndex', args });
      const { field_name } = args[1] as { field_name: string };
      return refused.includes(field_name)
        ? Promise.reject(new Error(`no index on ${field_name}`))
        : Promise.resolve({ status: 'acknowledged' });
    },
    count: record('count', { count: 0 }),
  };
  return { calls, client: client as unknown as QdrantClient };
}

/** Each index the store asked for, with the type it asked for, in the order it asked. */
const indexedBy = (calls: { method: string; args: unknown[] }[]): [string, string][] =>
  calls
    .filter((call) => call.method === 'createPayloadIndex')
    .map((call) => {
      const { field_name, field_schema } = call.args[1] as {
        field_name: string;
        field_schema: string;
      };
      return [field_name, field_schema];
    });

describe('the Qdrant store’s payload indexes', () => {
  it('[QL-41] [QL-60] asks for every declared index with its declared type on a collection built before them, once per process', async () => {
    const earlier = fakeClient(true);
    const store = new QdrantMemoryStore(earlier.client, 'm', 4);
    expect((await store.verify()).ready).toBe(true);
    expect(earlier.calls.map((call) => call.method)).not.toContain('createCollection');
    expect(indexedBy(earlier.calls)).toEqual(Object.entries(INDEXED_FIELDS));
    // The lineage paths ride the same loop as the facets: no second mechanism creates them.
    expect(indexedBy(earlier.calls)).toEqual(
      expect.arrayContaining([
        ['lineage.judged.runId', 'keyword'],
        ['lineage.adoptedFrom.runId', 'keyword'],
        ['lineage.goalHash', 'keyword'],
      ]),
    );
    await store.verify();
    expect(indexedBy(earlier.calls)).toHaveLength(Object.keys(INDEXED_FIELDS).length);
  });

  it('[QL-41] [QL-60] builds a new collection with every declared index', async () => {
    const fresh = fakeClient(false);
    await new QdrantMemoryStore(fresh.client, 'm', 4).verify();
    expect(fresh.calls.map((call) => call.method)).toContain('createCollection');
    expect(indexedBy(fresh.calls)).toEqual(Object.entries(INDEXED_FIELDS));
  });

  it('[QL-41] reports an index the server refuses and stays usable, asking for every other one', async () => {
    const refusing = fakeClient(true, ['lineage.goalHash']);
    const warnings: string[] = [];
    const store = new QdrantMemoryStore(
      refusing.client,
      'm',
      4,
      () => new Date(),
      (message) => warnings.push(message),
    );
    expect((await store.verify()).ready).toBe(true);
    expect(indexedBy(refusing.calls)).toEqual(Object.entries(INDEXED_FIELDS));
    expect(warnings).toEqual([
      'memory store: payload index lineage.goalHash not ensured on quality-memory__v2__m__4: no index on lineage.goalHash',
    ]);
  });
});
