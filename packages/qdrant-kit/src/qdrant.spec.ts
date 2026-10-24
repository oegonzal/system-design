import { collectionName, ensureCollection, type CollectionClient } from './qdrant';

/** A client over one collection's existence, recording what it was asked. */
const clientWith = (options: { exists: boolean; createFails?: boolean; refuse?: string }) => {
  const asked: string[] = [];
  let exists = options.exists;
  const client = {
    collectionExists: async () => ({ exists }),
    createCollection: async () => {
      asked.push('create');
      // Another process made it first: the create fails, but the collection stands.
      exists = true;
      if (options.createFails) throw new Error('already exists');
      return true;
    },
    createPayloadIndex: async (_collection: string, index: { field_name: string }) => {
      asked.push(`index ${index.field_name}`);
      if (index.field_name === options.refuse) throw new Error('bad schema');
      return { operation_id: 1, status: 'completed' as const };
    },
  } as unknown as CollectionClient;
  return { client, asked };
};

const spec = {
  vectors: { size: 4, distance: 'Cosine' as const },
  payloadIndexes: [
    { field: 'spaceId', schema: 'keyword' as const },
    { field: 'validFrom', schema: 'datetime' as const },
  ],
};

describe('a Qdrant collection', () => {
  it('is named by its store, generation, model and width, the model made safe for a name', () => {
    expect(collectionName('agentic-memory', 'v1', 'text-embedding-3-small', 1536)).toBe(
      'agentic-memory__v1__text-embedding-3-small__1536',
    );
    expect(collectionName('quality-memory', 'v2', 'org/model:latest', 8)).toBe(
      'quality-memory__v2__org-model-latest__8',
    );
  });

  it('is made when missing, survives losing the create to another process, and asks for every index each time', async () => {
    const fresh = clientWith({ exists: false });
    await ensureCollection(fresh.client, 'c', spec, () => undefined);
    expect(fresh.asked).toEqual(['create', 'index spaceId', 'index validFrom']);

    const raced = clientWith({ exists: false, createFails: true });
    await expect(
      ensureCollection(raced.client, 'c', spec, () => undefined),
    ).resolves.toBeUndefined();

    const standing = clientWith({ exists: true });
    await ensureCollection(standing.client, 'c', spec, () => undefined);
    expect(standing.asked).toEqual(['index spaceId', 'index validFrom']);
  });

  it('reports a refused index and keeps going: an unindexed field is slower, never wrong', async () => {
    const warnings: string[] = [];
    const refusing = clientWith({ exists: true, refuse: 'spaceId' });
    await ensureCollection(refusing.client, 'c', spec, (message) => warnings.push(message));
    expect(refusing.asked).toEqual(['index spaceId', 'index validFrom']);
    expect(warnings).toEqual(['payload index spaceId not ensured on c: bad schema']);
  });
});
