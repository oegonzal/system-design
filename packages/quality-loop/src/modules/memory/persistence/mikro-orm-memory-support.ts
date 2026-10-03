/**
 * Which run's evidence confirmed or contradicted which stored item, in Postgres.
 *
 * A source run's claims are replaced whole — delete by that run, insert what it
 * says now — which is what makes digesting a run twice converge instead of
 * counting twice. The count a search reads is derived from these rows and
 * written onto the vector payload by the caller, so nothing here is on a read
 * path and nothing here knows about the store.
 *
 * A claim counts only against the text it was made about: `countByPoint` asks
 * for the hash as well as the point, so an item re-digested into different words
 * keeps its id and loses its old support exactly, with no rule reading either
 * text.
 */
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MemorySupport } from '@sysdesign/db';

import { pointId } from '../qdrant/collection';
import type {
  SupportCount,
  SupportKind,
  SupportRow,
  SupportStore,
} from '../../../orchestrators/knowledge/ports';
import { supportKey } from '../../../orchestrators/knowledge/ports';

/**
 * The point id the store addresses an item by, derived the one way the store
 * derives it. It is a column here so the unique constraint can be on (point,
 * source run), and so a reader can join rows to points without recomputing it.
 */
const pointIdOf = (row: SupportRow): string => pointId(row.point.runId, row.point.ref);

const rowOf = (row: MemorySupport): SupportRow => ({
  point: { runId: row.targetRunId, ref: row.targetRef },
  contentHash: row.contentHash,
  kind: row.kind as SupportKind,
  digestRunId: row.digestRun,
});

@Injectable()
export class MikroOrmMemorySupport implements SupportStore {
  constructor(private readonly em: EntityManager) {}

  async replace(sourceRunId: string, rows: readonly SupportRow[]): Promise<number> {
    const em = this.em.fork();
    await em.nativeDelete(MemorySupport, { sourceRun: sourceRunId });
    if (rows.length === 0) return 0;
    await em.insertMany(
      MemorySupport,
      // Raw data skips the entity's initialisers: the id and the stamp are supplied here.
      rows.map((row) => ({
        id: crypto.randomUUID(),
        pointId: pointIdOf(row),
        targetRunId: row.point.runId,
        targetRef: row.point.ref,
        contentHash: row.contentHash,
        sourceRun: sourceRunId,
        digestRun: row.digestRunId,
        kind: row.kind,
        createdAt: new Date(),
      })),
    );
    return rows.length;
  }

  async countByPoint(
    points: readonly { point: { runId: string; ref: string }; contentHash: string }[],
  ): Promise<Map<string, SupportCount>> {
    if (points.length === 0) return new Map();
    const rows = await this.em.fork().find(MemorySupport, {
      targetRunId: { $in: [...new Set(points.map((item) => item.point.runId))] },
      targetRef: { $in: [...new Set(points.map((item) => item.point.ref))] },
    });
    const wanted = new Map(points.map((item) => [supportKey(item.point), item.contentHash]));
    const counts = new Map<string, SupportCount>();
    for (const row of rows) {
      const key = supportKey({ runId: row.targetRunId, ref: row.targetRef });
      // The pair query is a rectangle over two id lists, so a row it returns may
      // name a point nobody asked about; and a claim made against text the item
      // no longer carries is not support for what it says now.
      if (wanted.get(key) !== row.contentHash) continue;
      const count = counts.get(key) ?? { confirms: 0, contradicts: 0 };
      counts.set(key, {
        confirms: count.confirms + (row.kind === 'confirms' ? 1 : 0),
        contradicts: count.contradicts + (row.kind === 'contradicts' ? 1 : 0),
      });
    }
    return counts;
  }

  async bySourceRun(sourceRunId: string): Promise<SupportRow[]> {
    const rows = await this.em.fork().find(MemorySupport, { sourceRun: sourceRunId });
    return rows.map(rowOf);
  }
}
