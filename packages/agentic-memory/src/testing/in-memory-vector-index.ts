/**
 * A vector index in memory: cosine similarity over the points of one
 * collection, filtered by the same visibility a Qdrant filter states — the
 * partition, then every OTHER policy scope key either unset on the point or
 * equal to the request's, and a key the request does not name unset.
 */
import { byText } from '../order';
import type { PointPayload, VectorIndex, VisibilityFilter } from '../ports';

interface Point {
  vector: readonly number[];
  payload: PointPayload;
}

const cosine = (a: readonly number[], b: readonly number[]): number => {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
  const norms = Math.hypot(...a) * Math.hypot(...b);
  return norms === 0 ? 0 : dot / norms;
};

/** The visibility rule a point must meet, stated over the policy's scope keys. */
export function pointVisible(payload: PointPayload, filter: VisibilityFilter): boolean {
  const scopeHolds = filter.scopeKeys
    .slice(1)
    .every((key) =>
      key in filter.scope
        ? payload.scope[key] === undefined || payload.scope[key] === filter.scope[key]
        : payload.scope[key] === undefined,
    );
  const validFrom = Date.parse(payload.validFrom);
  return (
    payload.spaceId === filter.spaceId &&
    filter.registers.includes(payload.register) &&
    payload.partition === filter.partition &&
    scopeHolds &&
    (payload.expiresAt === null || Date.parse(payload.expiresAt) > filter.now.getTime()) &&
    (filter.since === undefined || validFrom >= filter.since.getTime()) &&
    (filter.until === undefined || validFrom < filter.until.getTime()) &&
    Object.entries(filter.where ?? {}).every(([field, value]) => payload.metadata[field] === value)
  );
}

export class InMemoryVectorIndex implements VectorIndex {
  private readonly points = new Map<string, Point>();

  constructor(readonly collection: string | null) {}

  /** Every point id held, for a spec to inspect. */
  ids(): string[] {
    return [...this.points.keys()].sort(byText);
  }

  upsert(
    points: readonly { id: string; vector: readonly number[]; payload: PointPayload }[],
  ): Promise<void> {
    for (const point of points) {
      this.points.set(point.id, {
        vector: [...point.vector],
        payload: structuredClone(point.payload),
      });
    }
    return Promise.resolve();
  }

  remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.points.delete(id);
    return Promise.resolve();
  }

  search(query: {
    vector: readonly number[];
    limit: number;
    filter: VisibilityFilter;
  }): Promise<{ id: string; score: number }[]> {
    return Promise.resolve(
      [...this.points.entries()]
        .filter(([, point]) => pointVisible(point.payload, query.filter))
        .map(([id, point]) => ({ id, score: cosine(query.vector, point.vector) }))
        .sort((a, b) => b.score - a.score || byText(a.id, b.id))
        .slice(0, query.limit),
    );
  }
}
