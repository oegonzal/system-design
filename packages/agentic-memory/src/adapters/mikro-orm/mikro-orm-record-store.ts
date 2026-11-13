/**
 * Records in Postgres, the runtime's truth, holding the contract the in-memory
 * store states (`record-store-contract.ts` runs against both). Each operation
 * runs on a fork of its own.
 *
 * A write is one transaction: the compare-and-set close of the record it
 * supersedes — an update that must still find that row active — then the
 * insert. A lost race, or the partial unique index refusing a second current
 * row per identity and exact scope, answers `conflict` with nothing applied.
 *
 * A read is the same visibility in jsonb: a record is VISIBLE to a request
 * whose scope contains its own (`scope <@ request`), and lies WITHIN a scope
 * its own contains (`scope @> request`). Exact scope is jsonb equality, which
 * ignores key order just as the canonical scope does.
 *
 * The entity is aliased `MemoryRecordRow` so it does not shadow the runtime's
 * own `MemoryRecord`.
 */
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { raw, type EntityManager } from '@mikro-orm/postgresql';
import type { RegisterKind } from '@sysdesign/contracts';
import { MemoryRecord as MemoryRecordRow } from '@sysdesign/db';

import { byText } from '../../order';
import type {
  Closing,
  Evidence,
  MemoryRecord,
  RecordChange,
  RecordQuery,
  RecordStore,
  ResolveKey,
} from '../../ports';

/** The jsonb containment each scope mode reads: the record's scope inside the request's, or around it. */
const SCOPE_CONTAINMENT = {
  visible: '"scope" <@ ?::jsonb',
  within: '"scope" @> ?::jsonb',
} as const satisfies Record<RecordQuery['scopeMode'], string>;

const SAME_SCOPE = '"scope" = ?::jsonb';
const HOLDS_KEY = '"keys" @> array[?]::text[]';
const HOLDS_METADATA = '"metadata" @> ?::jsonb';

export class MikroOrmRecordStore implements RecordStore {
  constructor(private readonly em: EntityManager) {}

  async commit(change: RecordChange): Promise<'committed' | 'conflict'> {
    try {
      return await this.em.fork().transactional(async (em) => {
        const { close } = change;
        if (close !== null && !(await closeIfCurrent(em, close.id, close.closing))) {
          return 'conflict';
        }
        await em.insert(MemoryRecordRow, rowOf(change.insert));
        return 'committed';
      });
    } catch (error) {
      // A second current row for one identity and exact scope, or an id taken: the race was lost.
      if (error instanceof UniqueConstraintViolationException) return 'conflict';
      throw error;
    }
  }

  async close(id: string, closing: Closing): Promise<'closed' | 'conflict'> {
    return (await closeIfCurrent(this.em.fork(), id, closing)) ? 'closed' : 'conflict';
  }

  /** Support and the records cited, in one statement; every other provenance field is left as written. */
  async reinforce(id: string, evidence: Evidence): Promise<void> {
    await this.em.fork().nativeUpdate(
      MemoryRecordRow,
      { id },
      {
        support: evidence.support,
        provenance: raw(`jsonb_set("provenance", '{derivedFrom}', ?::jsonb)`, [
          JSON.stringify(evidence.derivedFrom),
        ]),
      },
    );
  }

  /** By id, whatever its status; a record of another space is none of this caller's. */
  async get(spaceId: string, id: string): Promise<MemoryRecord | null> {
    const row = await this.em.fork().findOne(MemoryRecordRow, { id });
    return row === null || row.space !== spaceId ? null : recordOf(row);
  }

  async current(key: ResolveKey): Promise<MemoryRecord | null> {
    const row = await this.em
      .fork()
      .createQueryBuilder(MemoryRecordRow)
      .where({
        space: key.spaceId,
        register: key.register,
        status: 'active',
        ...('identity' in key ? { identity: key.identity } : { contentHash: key.contentHash }),
      })
      .andWhere(SAME_SCOPE, [JSON.stringify(key.scope)])
      // One row by identity, which the unique index holds; by content, the first recorded.
      .orderBy({ recordedAt: 'asc', id: 'asc' })
      .limit(1)
      .getSingleResult();
    return row === null ? null : recordOf(row);
  }

  /** The visibility predicate, then each narrowing the query names; newest valid time first, then by id. */
  async find(query: RecordQuery): Promise<MemoryRecord[]> {
    const qb = this.em
      .fork()
      .createQueryBuilder(MemoryRecordRow)
      .where({
        space: query.spaceId,
        partition: query.partition,
        register: { $in: query.registers },
        status: 'active',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: query.now } }],
      })
      .andWhere(SCOPE_CONTAINMENT[query.scopeMode], [JSON.stringify(query.scope)]);
    if (query.ids !== undefined) qb.andWhere({ id: { $in: query.ids } });
    if (query.key !== undefined) qb.andWhere(HOLDS_KEY, [query.key]);
    if (query.since !== undefined) qb.andWhere({ validFrom: { $gte: query.since } });
    if (query.until !== undefined) qb.andWhere({ validFrom: { $lt: query.until } });
    if (query.where !== undefined) qb.andWhere(HOLDS_METADATA, [JSON.stringify(query.where)]);
    qb.orderBy({ validFrom: 'desc', id: 'asc' });
    if (query.limit !== null) qb.limit(query.limit);
    return (await qb.getResult()).map(recordOf);
  }

  async lineage(spaceId: string, lineageId: string): Promise<MemoryRecord[]> {
    const rows = await this.em
      .fork()
      .find(
        MemoryRecordRow,
        { space: spaceId, lineageId },
        { orderBy: { version: 'asc', id: 'asc' } },
      );
    return rows.map(recordOf);
  }

  /** One statement, so of two sweeps at once each row is expired by exactly one; its valid time ends at its expiry. */
  async expire(now: Date): Promise<MemoryRecord[]> {
    const em = this.em.fork();
    const closed = await em
      .createQueryBuilder(MemoryRecordRow)
      .update({ status: 'expired', validTo: raw('"expires_at"'), closedAt: now })
      .where({ status: 'active', expiresAt: { $lte: now } })
      .returning('*')
      .execute<Record<string, unknown>[]>('all', false);
    return closed
      .map((row) => recordOf(em.map(MemoryRecordRow, row)))
      .sort((a, b) => byText(a.id, b.id));
  }

  async projectionDue(
    collection: string,
    kinds: readonly RegisterKind[],
    limit: number,
  ): Promise<MemoryRecord[]> {
    const rows = await this.em.fork().find(
      MemoryRecordRow,
      {
        status: 'active',
        kind: { $in: kinds },
        // A record never projected holds null, which `!=` alone would never match.
        $or: [{ projectedInto: null }, { projectedInto: { $ne: collection } }],
      },
      { orderBy: { id: 'asc' }, limit },
    );
    return rows.map(recordOf);
  }

  async unprojectionDue(limit: number): Promise<MemoryRecord[]> {
    const rows = await this.em
      .fork()
      .find(
        MemoryRecordRow,
        { status: { $ne: 'active' }, projectedInto: { $ne: null } },
        { orderBy: { id: 'asc' }, limit },
      );
    return rows.map(recordOf);
  }

  async markProjected(ids: readonly string[], collection: string | null): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(MemoryRecordRow, { id: { $in: ids } }, { projectedInto: collection });
  }
}

/** The compare-and-set close: it applies only while the row is still active, so of two writers that read one current record, one closes it. */
async function closeIfCurrent(em: EntityManager, id: string, closing: Closing): Promise<boolean> {
  const closed = await em.nativeUpdate(
    MemoryRecordRow,
    { id, status: 'active' },
    {
      status: closing.status,
      validTo: closing.validTo,
      closedAt: closing.closedAt,
      closeReason: closing.reason,
    },
  );
  return closed === 1;
}

/** The row a record is kept as, its space named by id. */
const rowOf = ({ spaceId, keys, provenance, ...record }: MemoryRecord) => ({
  ...record,
  space: spaceId,
  keys: [...keys],
  provenance: { ...provenance, derivedFrom: [...provenance.derivedFrom] },
});

const recordOf = (row: MemoryRecordRow): MemoryRecord => ({
  id: row.id,
  spaceId: row.space,
  register: row.register,
  kind: row.kind,
  partition: row.partition,
  scope: row.scope,
  identity: row.identity,
  keys: row.keys,
  body: row.body,
  metadata: row.metadata,
  text: row.text,
  contentHash: row.contentHash,
  status: row.status,
  version: row.version,
  supersedesId: row.supersedesId,
  lineageId: row.lineageId,
  validFrom: row.validFrom,
  validTo: row.validTo,
  recordedAt: row.recordedAt,
  expiresAt: row.expiresAt,
  closedAt: row.closedAt,
  closeReason: row.closeReason,
  support: row.support,
  provenance: row.provenance,
  projectedInto: row.projectedInto,
});
