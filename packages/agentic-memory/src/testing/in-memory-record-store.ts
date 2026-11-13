/**
 * Records in memory, holding the same contract as the Postgres store
 * (`record-store-contract.ts` runs against both): a write closes the record it
 * supersedes only while that record is still current, one current record
 * stands per identity and exact scope (and, for a kind that appends, per
 * content and exact scope), a read is of current, unexpired records
 * in the scope mode it names, ordered newest valid time first, then by id.
 * Copies go in and out, so a caller can never change a stored row.
 */
import type { RecordScope, RegisterKind } from '@sysdesign/contracts';

import { byText } from '../order';
import type {
  Closing,
  Evidence,
  MemoryRecord,
  RecordChange,
  RecordQuery,
  RecordStore,
  ResolveKey,
} from '../ports';
import { canonicalScope, visibleTo } from '../space/scope';

/** A record lies within a scope its own contains: visibility read the other way round, as `scope <@` is in SQL. */
const liesWithin = (record: RecordScope, scope: RecordScope): boolean => visibleTo(scope, record);

const copy = (record: MemoryRecord): MemoryRecord => structuredClone(record);

const sameSlot = (a: MemoryRecord, b: MemoryRecord): boolean =>
  a.spaceId === b.spaceId &&
  a.register === b.register &&
  canonicalScope(a.scope) === canonicalScope(b.scope);

const unexpired = (record: MemoryRecord, now: Date): boolean =>
  record.expiresAt === null || record.expiresAt.getTime() > now.getTime();

const newestFirst = (a: MemoryRecord, b: MemoryRecord): number =>
  b.validFrom.getTime() - a.validFrom.getTime() || byText(a.id, b.id);

export class InMemoryRecordStore implements RecordStore {
  private readonly rows = new Map<string, MemoryRecord>();

  /** Every row as stored, for a spec to inspect. */
  all(): MemoryRecord[] {
    return [...this.rows.values()].map(copy);
  }

  commit(change: RecordChange): Promise<'committed' | 'conflict'> {
    const closing = change.close;
    if (closing !== null && this.rows.get(closing.id)?.status !== 'active') {
      return Promise.resolve('conflict');
    }
    const { insert } = change;
    const taken = [...this.rows.values()].some(
      (row) =>
        row.status === 'active' &&
        row.id !== closing?.id &&
        sameSlot(row, insert) &&
        (insert.identity === null
          ? row.identity === null && row.contentHash === insert.contentHash
          : row.identity === insert.identity),
    );
    if (taken || this.rows.has(insert.id)) return Promise.resolve('conflict');
    if (closing !== null) this.apply(closing.id, closing.closing);
    this.rows.set(insert.id, copy(insert));
    return Promise.resolve('committed');
  }

  close(id: string, closing: Closing): Promise<'closed' | 'conflict'> {
    if (this.rows.get(id)?.status !== 'active') return Promise.resolve('conflict');
    this.apply(id, closing);
    return Promise.resolve('closed');
  }

  reinforce(id: string, evidence: Evidence): Promise<void> {
    const row = this.rows.get(id);
    if (row !== undefined) {
      row.support = evidence.support;
      row.provenance = { ...row.provenance, derivedFrom: [...evidence.derivedFrom] };
    }
    return Promise.resolve();
  }

  get(spaceId: string, id: string): Promise<MemoryRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined || row.spaceId !== spaceId ? null : copy(row));
  }

  current(key: ResolveKey): Promise<MemoryRecord | null> {
    const scope = canonicalScope(key.scope);
    const found = [...this.rows.values()].find(
      (row) =>
        row.status === 'active' &&
        row.spaceId === key.spaceId &&
        row.register === key.register &&
        canonicalScope(row.scope) === scope &&
        ('identity' in key ? row.identity === key.identity : row.contentHash === key.contentHash),
    );
    return Promise.resolve(found === undefined ? null : copy(found));
  }

  find(query: RecordQuery): Promise<MemoryRecord[]> {
    const inScope = query.scopeMode === 'visible' ? visibleTo : liesWithin;
    const ids = query.ids === undefined ? null : new Set(query.ids);
    const matches = [...this.rows.values()]
      .filter(
        (row) =>
          row.status === 'active' &&
          unexpired(row, query.now) &&
          row.spaceId === query.spaceId &&
          row.partition === query.partition &&
          query.registers.includes(row.register) &&
          inScope(row.scope, query.scope) &&
          (ids === null || ids.has(row.id)) &&
          (query.key === undefined || row.keys.includes(query.key)) &&
          (query.since === undefined || row.validFrom.getTime() >= query.since.getTime()) &&
          (query.until === undefined || row.validFrom.getTime() < query.until.getTime()) &&
          Object.entries(query.where ?? {}).every(
            ([field, value]) => row.metadata[field] === value,
          ),
      )
      .sort(newestFirst);
    return Promise.resolve(
      (query.limit === null ? matches : matches.slice(0, query.limit)).map(copy),
    );
  }

  lineage(spaceId: string, lineageId: string): Promise<MemoryRecord[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.spaceId === spaceId && row.lineageId === lineageId)
        .sort((a, b) => a.version - b.version)
        .map(copy),
    );
  }

  expire(now: Date): Promise<MemoryRecord[]> {
    const due = [...this.rows.values()].filter(
      (row) =>
        row.status === 'active' &&
        row.expiresAt !== null &&
        row.expiresAt.getTime() <= now.getTime(),
    );
    for (const row of due) {
      this.apply(row.id, {
        status: 'expired',
        validTo: row.expiresAt ?? now,
        closedAt: now,
        reason: null,
      });
    }
    return Promise.resolve(due.map((row) => copy(this.rows.get(row.id) ?? row)));
  }

  projectionDue(
    collection: string,
    kinds: readonly RegisterKind[],
    limit: number,
  ): Promise<MemoryRecord[]> {
    return Promise.resolve(
      this.firstById(
        (row) =>
          row.status === 'active' && kinds.includes(row.kind) && row.projectedInto !== collection,
        limit,
      ),
    );
  }

  unprojectionDue(limit: number): Promise<MemoryRecord[]> {
    return Promise.resolve(
      this.firstById((row) => row.status !== 'active' && row.projectedInto !== null, limit),
    );
  }

  markProjected(ids: readonly string[], collection: string | null): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row !== undefined) row.projectedInto = collection;
    }
    return Promise.resolve();
  }

  private firstById(matches: (row: MemoryRecord) => boolean, limit: number): MemoryRecord[] {
    return [...this.rows.values()]
      .filter(matches)
      .sort((a, b) => byText(a.id, b.id))
      .slice(0, limit)
      .map(copy);
  }

  private apply(id: string, closing: Closing): void {
    const row = this.rows.get(id);
    if (row === undefined) return;
    row.status = closing.status;
    row.validTo = closing.validTo;
    row.closedAt = closing.closedAt;
    row.closeReason = closing.reason;
  }
}
