/**
 * The record-store contract every `RecordStore` holds — the in-memory fake
 * and the Postgres store run the same cases, so a spec on the fake proves
 * what the database does. A store is handed its space by `setup`: Postgres
 * needs a real space row for its foreign key.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Closing, RecordStore } from '../ports';
import { recordFixture } from './fixtures';

const T0 = new Date('2026-10-01T00:00:00.000Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const superseded = (when: Date): Closing => ({
  status: 'superseded',
  validTo: when,
  closedAt: when,
  reason: null,
});

export function recordStoreContract(
  label: string,
  setup: () => Promise<{ store: RecordStore; spaceId: string }>,
): void {
  describe(`the record store contract (${label})`, () => {
    let store: RecordStore;
    let spaceId: string;
    const record = (overrides: Parameters<typeof recordFixture>[0] = {}) =>
      recordFixture({ spaceId, ...overrides });

    beforeEach(async () => {
      ({ store, spaceId } = await setup());
    });

    it('[AGM-10] keeps a copy: what a caller reads cannot change what is stored', async () => {
      expect(await store.commit({ insert: record({ id: id(1) }), close: null })).toBe('committed');
      const read = await store.get(spaceId, id(1));
      expect(read?.text).toBe('acme — language: TypeScript');
      if (read) (read.keys as string[]).push('mutated');
      expect((await store.get(spaceId, id(1)))?.keys).toEqual(['acme']);
      expect(await store.get('another-space', id(1))).toBeNull();
    });

    it('[AGM-10] holds one current record per identity and exact scope', async () => {
      await store.commit({ insert: record({ id: id(1) }), close: null });
      expect(await store.commit({ insert: record({ id: id(2) }), close: null })).toBe('conflict');
      // The same identity under a narrower scope is a different slot.
      const narrower = { scope: { tenant: 't1', user: 'u1' } };
      expect(await store.commit({ insert: record({ id: id(3), ...narrower }), close: null })).toBe(
        'committed',
      );
      // A kind that appends has no identity and never collides on it.
      const episode = { identity: null, register: 'episodes', kind: 'episodic' as const };
      expect(await store.commit({ insert: record({ id: id(4), ...episode }), close: null })).toBe(
        'committed',
      );
      expect(
        await store.commit({
          insert: record({ id: id(5), ...episode, contentHash: 'b'.repeat(64) }),
          close: null,
        }),
      ).toBe('committed');
      // ...but it stands once per content and exact scope: the same episode twice is one.
      expect(
        await store.commit({
          insert: record({ id: id(6), ...episode, contentHash: 'b'.repeat(64) }),
          close: null,
        }),
      ).toBe('conflict');
    });

    it('[AGM-10] supersedes in one step, only while the old record is current', async () => {
      await store.commit({ insert: record({ id: id(1) }), close: null });
      const next = record({
        id: id(2),
        version: 2,
        supersedesId: id(1),
        lineageId: id(1),
        validFrom: at(5),
      });
      expect(
        await store.commit({ insert: next, close: { id: id(1), closing: superseded(at(5)) } }),
      ).toBe('committed');
      const old = await store.get(spaceId, id(1));
      expect(old).toMatchObject({ status: 'superseded', closeReason: null });
      expect(old?.validTo?.toISOString()).toBe(at(5).toISOString());
      expect((await store.lineage(spaceId, id(1))).map((row) => row.version)).toEqual([1, 2]);

      // A writer that read version 1 loses the race: nothing it sent is applied.
      const stale = record({ id: id(3), version: 2, supersedesId: id(1), lineageId: id(1) });
      expect(
        await store.commit({ insert: stale, close: { id: id(1), closing: superseded(at(6)) } }),
      ).toBe('conflict');
      expect(await store.get(spaceId, id(3))).toBeNull();
      expect(await store.close(id(1), superseded(at(7)))).toBe('conflict');
      expect(
        await store.close(id(2), { ...superseded(at(8)), status: 'invalidated', reason: 'wrong' }),
      ).toBe('closed');
      expect((await store.get(spaceId, id(2)))?.closeReason).toBe('wrong');
    });

    it('[AGM-10] resolves the current record by identity or by content, in the exact scope only', async () => {
      await store.commit({ insert: record({ id: id(1) }), close: null });
      const slot = { spaceId, register: 'facts', scope: { tenant: 't1' } };
      expect((await store.current({ ...slot, identity: '["acme","language"]' }))?.id).toBe(id(1));
      expect((await store.current({ ...slot, contentHash: 'a'.repeat(64) }))?.id).toBe(id(1));
      expect(
        await store.current({
          ...slot,
          scope: { tenant: 't1', user: 'u1' },
          identity: '["acme","language"]',
        }),
      ).toBeNull();
    });

    it('[AGM-10] reads current, unexpired records in the scope mode asked, newest first, then by id', async () => {
      const rows = [
        record({ id: id(1), scope: { tenant: 't1' }, validFrom: at(1), identity: '["a"]' }),
        record({
          id: id(2),
          scope: { tenant: 't1', user: 'u1' },
          validFrom: at(3),
          identity: '["b"]',
        }),
        record({
          id: id(3),
          scope: { tenant: 't1', user: 'u2' },
          validFrom: at(3),
          identity: '["c"]',
        }),
        record({ id: id(4), validFrom: at(2), identity: '["d"]', expiresAt: at(10) }),
        record({
          id: id(5),
          validFrom: at(4),
          identity: '["e"]',
          keys: ['beta'],
          metadata: { topic: 'x' },
        }),
      ];
      for (const row of rows) await store.commit({ insert: row, close: null });
      const base = {
        spaceId,
        registers: ['facts'],
        partition: 't1',
        now: at(5),
        limit: null,
      };
      const ids = async (query: Partial<Parameters<RecordStore['find']>[0]>) =>
        (
          await store.find({ ...base, scope: { tenant: 't1' }, scopeMode: 'visible', ...query })
        ).map((row) => row.id);
      // A tenant-wide reader sees the tenant's records, never a user's.
      expect(await ids({})).toEqual([id(5), id(4), id(1)]);
      // A user sees the tenant's and their own, not a sibling's.
      expect(await ids({ scope: { tenant: 't1', user: 'u1' } })).toEqual([
        id(5),
        id(2),
        id(4),
        id(1),
      ]);
      // Within a tenant: everything at or below it, ties broken by id.
      expect(await ids({ scopeMode: 'within' })).toEqual([id(5), id(2), id(3), id(4), id(1)]);
      expect(await ids({ key: 'beta' })).toEqual([id(5)]);
      expect(await ids({ where: { topic: 'x' } })).toEqual([id(5)]);
      expect(await ids({ since: at(2), until: at(4) })).toEqual([id(4)]);
      expect(await ids({ ids: [id(1), id(3)] })).toEqual([id(1)]);
      expect(await ids({ now: at(10) })).toEqual([id(5), id(1)]);
      expect(await ids({ limit: 2 })).toEqual([id(5), id(4)]);
      expect(await ids({ registers: ['episodes'] })).toEqual([]);
    });

    it('[AGM-10] refreshes a derived record’s evidence in place, its content untouched', async () => {
      await store.commit({ insert: record({ id: id(1) }), close: null });
      await store.reinforce(id(1), { support: 4, derivedFrom: [id(7), id(8)] });
      const row = await store.get(spaceId, id(1));
      expect(row).toMatchObject({ support: 4, text: 'acme — language: TypeScript', version: 1 });
      expect(row?.provenance.derivedFrom).toEqual([id(7), id(8)]);
    });

    it('[AGM-10] expires what is past its time, its valid time ending at the expiry', async () => {
      await store.commit({
        insert: record({ id: id(1), identity: '["a"]', expiresAt: at(10) }),
        close: null,
      });
      await store.commit({
        insert: record({ id: id(2), identity: '["b"]', expiresAt: at(30) }),
        close: null,
      });
      expect(await store.expire(at(9))).toEqual([]);
      const expired = await store.expire(at(20));
      expect(expired.map((row) => row.id)).toEqual([id(1)]);
      expect(expired[0]).toMatchObject({ status: 'expired' });
      expect(expired[0]?.validTo?.toISOString()).toBe(at(10).toISOString());
      expect(expired[0]?.closedAt?.toISOString()).toBe(at(20).toISOString());
      expect((await store.get(spaceId, id(2)))?.status).toBe('active');
    });

    it('[AGM-10] reads what is due for projection a page at a time, in id order', async () => {
      for (const n of [3, 1, 2]) {
        await store.commit({ insert: record({ id: id(n), identity: `["${n}"]` }), close: null });
      }
      const due = async (limit: number) =>
        (await store.projectionDue('c1', ['semantic'], limit)).map((row) => row.id);
      expect(await due(2)).toEqual([id(1), id(2)]);
      await store.markProjected([id(1), id(2)], 'c1');
      expect(await due(2)).toEqual([id(3)]);
    });

    it('[AGM-10] tracks which collection holds each point, whatever the record’s status', async () => {
      await store.commit({ insert: record({ id: id(1), identity: '["a"]' }), close: null });
      await store.commit({
        insert: record({ id: id(2), identity: '["b"]', register: 'relations', kind: 'relational' }),
        close: null,
      });
      expect((await store.projectionDue('c1', ['semantic'], 10)).map((row) => row.id)).toEqual([
        id(1),
      ]);
      await store.markProjected([id(1)], 'c1');
      expect(await store.projectionDue('c1', ['semantic'], 10)).toEqual([]);
      expect((await store.projectionDue('c2', ['semantic'], 10)).map((row) => row.id)).toEqual([
        id(1),
      ]);
      await store.close(id(1), { ...superseded(at(5)), status: 'invalidated', reason: 'gone' });
      expect((await store.unprojectionDue('c1', 10)).map((row) => row.id)).toEqual([id(1)]);
      await store.markProjected([id(1)], null);
      expect(await store.unprojectionDue('c1', 10)).toEqual([]);
    });
  });
}
