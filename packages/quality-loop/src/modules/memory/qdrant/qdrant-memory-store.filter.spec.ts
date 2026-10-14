import type { QdrantClient } from '@qdrant/js-client-rest';
import { UNIT_BOUND_SCOPES } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { MemoryProbe } from '../../../orchestrators/memory/ports';
import { QdrantMemoryStore, unitExclusion } from './qdrant-memory-store';

/** A client over a collection that exists and answers every search with nothing, keeping what it was asked. */
function recordingClient() {
  const searches: Record<string, unknown>[] = [];
  const client = {
    collectionExists: () => Promise.resolve({ exists: true }),
    createPayloadIndex: () => Promise.resolve({ status: 'acknowledged' }),
    queryBatch: (_: string, request: { searches: Record<string, unknown>[] }) => {
      searches.push(...request.searches);
      return Promise.resolve(request.searches.map(() => ({ points: [] })));
    },
  };
  return { searches, client: client as unknown as QdrantClient };
}

const probe = (filter?: MemoryProbe['filter']): MemoryProbe => ({
  vector: [1, 0, 0, 0],
  using: 'lesson',
  limit: 3,
  ...(filter === undefined ? {} : { filter }),
});

describe('what the Qdrant store asks of every search', () => {
  it('[QL-71] leaves out every memory bound to a unit of work unless the search names its unit — with no other filter, beside one, and nested so a named unit reads its own alone', async () => {
    const { searches, client } = recordingClient();
    const store = new QdrantMemoryStore(client, 'm', 4);
    await store.searchMany([
      probe(),
      probe({ kinds: ['profile_fact'], notRunIds: ['r1'] }),
      probe({ unitKey: 'U' }),
    ]);
    const bound = { key: 'scope', match: { any: [...UNIT_BOUND_SCOPES] } };
    expect(searches.map((search) => search['filter'])).toEqual([
      { must_not: [bound] },
      {
        must: [{ key: 'kind', match: { any: ['profile_fact'] } }],
        must_not: [{ key: 'runId', match: { any: ['r1'] } }, bound],
      },
      { must_not: [{ must: [bound], must_not: [{ key: 'unitKey', match: { value: 'U' } }] }] },
    ]);
  });

  it('[QL-71] states no clause when no scope is bound to a unit: an empty must nested in a must_not would leave out every memory but one unit’s', () => {
    expect(unitExclusion([], undefined)).toEqual([]);
    expect(unitExclusion([], 'U')).toEqual([]);
    expect(unitExclusion(['unit'], undefined)).toEqual([
      { key: 'scope', match: { any: ['unit'] } },
    ]);
  });
});
