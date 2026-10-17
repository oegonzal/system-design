/**
 * The projection of current records into the vector index, and its removal.
 * Postgres stays the truth: a projection that fails leaves its record unmarked
 * for the sweep to project again — an exact or a temporal recall finds it
 * meanwhile — and a semantic hit is only returned once Postgres confirms the
 * record is still current, so a point left behind is never served.
 */
import { messageOf } from '../errors';
import type { MemoryPorts, MemoryRecord, PointPayload } from '../ports';

export const pointOf = (record: MemoryRecord): PointPayload => ({
  spaceId: record.spaceId,
  register: record.register,
  partition: record.partition,
  scope: { ...record.scope },
  metadata: { ...record.metadata },
  validFrom: record.validFrom.toISOString(),
  expiresAt: record.expiresAt?.toISOString() ?? null,
});

export type ProjectionOutcome =
  | { projected: readonly string[] }
  | { projected: readonly []; failed: 'no_model' | 'embedding_failed' | 'index_failed' };

/** Project these records in one embedding call; which ids landed, or why none did. */
export async function project(
  ports: MemoryPorts,
  records: readonly MemoryRecord[],
): Promise<ProjectionOutcome> {
  const collection = ports.index.collection;
  if (records.length === 0) return { projected: [] };
  if (collection === null || ports.embedder.model === null)
    return { projected: [], failed: 'no_model' };
  const vectors = await ports.embedder.embed(records.map((record) => record.text));
  if (vectors === null || vectors.length !== records.length) {
    ports.warn(`projection: the embedder returned no vectors for ${records.length} record(s)`);
    return { projected: [], failed: 'embedding_failed' };
  }
  const points = records.flatMap((record, index) => {
    const vector = vectors[index];
    return vector === undefined ? [] : [{ id: record.id, vector, payload: pointOf(record) }];
  });
  try {
    await ports.index.upsert(points);
  } catch (error) {
    ports.warn(`projection: the index refused ${points.length} point(s): ${messageOf(error)}`);
    return { projected: [], failed: 'index_failed' };
  }
  const ids = points.map((point) => point.id);
  await ports.records.markProjected(ids, collection);
  return { projected: ids };
}

/** Remove these records' points, best effort — one left behind is filtered out by Postgres and removed by the next sweep — and say whether they went. */
export async function unproject(ports: MemoryPorts, ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    await ports.index.remove(ids);
    await ports.records.markProjected(ids, null);
    return true;
  } catch (error) {
    ports.warn(`projection: ${ids.length} point(s) not removed yet: ${messageOf(error)}`);
    return false;
  }
}
