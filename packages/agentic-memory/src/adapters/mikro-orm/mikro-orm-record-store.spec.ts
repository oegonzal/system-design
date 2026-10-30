import { randomUUID } from 'node:crypto';

import { MikroORM } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  MemoryRecord as MemoryRecordRow,
  MemorySpace as MemorySpaceRow,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import type { Closing } from '../../ports';
import { recordFixture, spaceFixture } from '../../testing/fixtures';
import { recordStoreContract } from '../../testing/record-store-contract';
import { MikroOrmRecordStore } from './mikro-orm-record-store';
import { MikroOrmSpaceStore } from './mikro-orm-space-store';

const T0 = new Date('2026-10-01T00:00:00.000Z');
const LATER = new Date('2026-10-01T00:05:00.000Z');
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let orm: MikroORM;

beforeAll(async () => {
  await ensureDatabase();
  orm = await MikroORM.init(ormOptions);
});
afterAll(async () => {
  await orm.close();
});

/** Empty tables and one space in them: every record names its space by a foreign key. */
async function storeOverOneSpace(): Promise<{ store: MikroOrmRecordStore; spaceId: string }> {
  await truncateTestTables(orm.em.fork(), [MemoryRecordRow, MemorySpaceRow]);
  const spaceId = randomUUID();
  await new MikroOrmSpaceStore(orm.em).insert(spaceFixture({ id: spaceId }));
  return { store: new MikroOrmRecordStore(orm.em), spaceId };
}

recordStoreContract('postgres', storeOverOneSpace);

describe('the Postgres record store under concurrent writes', () => {
  let store: MikroOrmRecordStore;
  let spaceId: string;

  beforeEach(async () => {
    ({ store, spaceId } = await storeOverOneSpace());
  });

  it('[AGM-3] commits one of two concurrent writes of one identity in one scope, and answers the other conflict', async () => {
    const outcomes = await Promise.all(
      [id(1), id(2)].map((each) =>
        store.commit({ insert: recordFixture({ spaceId, id: each }), close: null }),
      ),
    );
    expect([...outcomes].sort()).toEqual(['committed', 'conflict']);
    const current = await store.find({
      spaceId,
      registers: ['facts'],
      partition: 't1',
      scope: { tenant: 't1' },
      scopeMode: 'within',
      now: T0,
      limit: null,
    });
    expect(current.map((row) => row.id)).toEqual([outcomes[0] === 'committed' ? id(1) : id(2)]);
  });

  it('[AGM-3] applies one of a supersede and an invalidation racing for one version, never both', async () => {
    // Only one side inserts, so the unique index cannot settle this race: the
    // compare-and-set close alone keeps the history whole.
    await store.commit({ insert: recordFixture({ spaceId, id: id(1) }), close: null });
    const superseded: Closing = {
      status: 'superseded',
      validTo: LATER,
      closedAt: LATER,
      reason: null,
    };
    const nextVersion = recordFixture({
      spaceId,
      id: id(2),
      version: 2,
      supersedesId: id(1),
      lineageId: id(1),
      validFrom: LATER,
    });
    const [written, invalidated] = await Promise.all([
      store.commit({ insert: nextVersion, close: { id: id(1), closing: superseded } }),
      store.close(id(1), { ...superseded, status: 'invalidated', reason: 'wrong' }),
    ]);
    expect([written, invalidated].filter((outcome) => outcome === 'conflict')).toHaveLength(1);
    const versions = await store.lineage(spaceId, id(1));
    expect(versions.map((row) => row.status)).toEqual(
      written === 'committed' ? ['superseded', 'active'] : ['invalidated'],
    );
  });
});
