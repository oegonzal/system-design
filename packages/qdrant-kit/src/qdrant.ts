/**
 * What every Qdrant-backed store in the repository does the same way: how a
 * collection is named, how a client is built, and how a collection and its
 * payload indexes are made sure of at boot. What a store keeps in its points,
 * which vectors it names and which fields it filters by are the store's.
 */
import { QdrantClient, type Schemas } from '@qdrant/js-client-rest';
import { errorMessage } from '@sysdesign/contracts';

/** Where Qdrant listens when the environment names nowhere else: the compose stack's port. */
export const DEFAULT_QDRANT_URL = 'http://localhost:6333';

/** A stalled store must not hold a request or a boot; a refused one is reported at once. */
const QDRANT_TIMEOUT_MS = 5_000;

export const qdrantClient = (options: { url: string; apiKey?: string }): QdrantClient =>
  new QdrantClient({
    url: options.url,
    apiKey: options.apiKey,
    timeout: QDRANT_TIMEOUT_MS,
    checkCompatibility: false,
  });

/**
 * A collection bound to what its vectors mean: the store, the generation of
 * what it embeds, the embedding model and the width — cosines across any two
 * of those are not comparable, so a change to one is a new collection, never a
 * migration.
 */
export const collectionName = (
  store: string,
  generation: string,
  model: string,
  dimensions: number,
): string => `${store}__${generation}__${model.replace(/[^A-Za-z0-9_-]/g, '-')}__${dimensions}`;

export interface CollectionSpec {
  vectors: Schemas['VectorsConfig'];
  payloadIndexes: readonly { field: string; schema: Schemas['PayloadSchemaType'] }[];
}

/** The calls `ensureCollection` makes; the client satisfies it, and a spec can. */
export type CollectionClient = Pick<
  QdrantClient,
  'collectionExists' | 'createCollection' | 'createPayloadIndex'
>;

/**
 * The collection, made when missing, and every payload index asked for. Two
 * processes may boot at once: the loser of the create checks again instead of
 * failing. Every index is asked for even when the collection already stood —
 * asking for one that exists is a no-op — so a field declared after the
 * collection was built is indexed on the next boot. A refused index is
 * reported, not fatal: an unindexed field is a slower filter, never a wrong
 * one.
 */
export async function ensureCollection(
  client: CollectionClient,
  collection: string,
  spec: CollectionSpec,
  warn: (message: string) => void,
): Promise<void> {
  if (!(await client.collectionExists(collection)).exists) {
    await client
      .createCollection(collection, { vectors: spec.vectors })
      .catch(async (error: unknown) => {
        if (!(await client.collectionExists(collection)).exists) throw error;
      });
  }
  for (const { field, schema } of spec.payloadIndexes) {
    try {
      await client.createPayloadIndex(collection, {
        field_name: field,
        field_schema: schema,
        wait: true,
      });
    } catch (error) {
      warn(`payload index ${field} not ensured on ${collection}: ${errorMessage(error)}`);
    }
  }
}
