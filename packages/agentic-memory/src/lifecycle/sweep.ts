/**
 * The sweep, run on a schedule across every space: it expires short-term
 * records past their time, removes the points of records that closed, and
 * projects every current record whose point is not in the current collection
 * — a write whose projection failed, or every record at once after the
 * embedding model or its width changed, since the collection name binds both
 * and a new one starts empty. It works a page at a time, and a page that makes
 * no progress (the index or the embedder refused) ends that step until the
 * next sweep — never a loop over the same records. Each step reports what it did.
 */
import type { RegisterKind } from '@sysdesign/contracts';

import type { BehaviorRegistry } from '../kinds/behavior';
import type { MemoryPorts } from '../ports';
import { project, unproject } from '../write/projection';

/** One embedding request's worth: how many records a sweep reads, embeds and moves per page. */
const PAGE = 100;

export interface SweepReport {
  expired: number;
  unprojected: number;
  projected: number;
  /** Why records stayed unprojected this sweep; null when nothing did. */
  failed: 'no_model' | 'embedding_failed' | 'index_failed' | null;
}

async function unprojectClosed(ports: MemoryPorts, collection: string): Promise<number> {
  let unprojected = 0;
  for (;;) {
    const closed = await ports.records.unprojectionDue(collection, PAGE);
    if (
      closed.length === 0 ||
      !(await unproject(
        ports,
        closed.map((record) => record.id),
      ))
    )
      break;
    unprojected += closed.length;
    if (closed.length < PAGE) break;
  }
  return unprojected;
}

async function projectDue(
  ports: MemoryPorts,
  collection: string,
  kinds: readonly RegisterKind[],
): Promise<Pick<SweepReport, 'projected' | 'failed'>> {
  let projected = 0;
  for (;;) {
    const due = await ports.records.projectionDue(collection, kinds, PAGE);
    if (due.length === 0) break;
    const outcome = await project(ports, due);
    projected += outcome.projected.length;
    if ('failed' in outcome) return { projected, failed: outcome.failed };
    if (due.length < PAGE) break;
  }
  return { projected, failed: null };
}

export async function sweep(ports: MemoryPorts, behaviors: BehaviorRegistry): Promise<SweepReport> {
  const expired = await ports.records.expire(ports.clock());
  const collection = ports.index.collection;
  if (collection === null || ports.embedder.model === null) {
    return { expired: expired.length, unprojected: 0, projected: 0, failed: 'no_model' };
  }
  const unprojected = await unprojectClosed(ports, collection);
  const projectedKinds = (Object.keys(behaviors) as RegisterKind[]).filter(
    (kind) => behaviors[kind]?.projected === true,
  );
  const { projected, failed } = await projectDue(ports, collection, projectedKinds);
  return { expired: expired.length, unprojected, projected, failed };
}
