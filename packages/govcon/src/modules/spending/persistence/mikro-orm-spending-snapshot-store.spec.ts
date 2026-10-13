import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  GovconSpendingSnapshot,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { MikroOrmSpendingSnapshotStore } from './mikro-orm-spending-snapshot-store';

describe('the spending snapshot store in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await truncateTestTables(orm.em, [GovconSpendingSnapshot]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconSpendingSnapshot]);
    await orm.close(true);
  });

  it('[GOV-20] upserts one row per lens and key, reads it back with its payload and stamps, and answers null for an unknown key', async () => {
    const store = new MikroOrmSpendingSnapshotStore(orm.em);
    const fetchedAt = new Date('2026-06-15T12:00:00.000Z');
    await store.put({
      lens: 'pulse',
      queryKey: 'k1',
      query: { naics: ['332710'] },
      fetchedAt,
      asOf: '2026-06-14',
      requests: 2,
      payload: { series: [1, 2, 3] },
    });
    await store.put({
      lens: 'freshness',
      queryKey: 'k1',
      query: {},
      fetchedAt,
      asOf: null,
      requests: 1,
      payload: { lastUpdated: '2026-06-14' },
    });
    await store.put({
      lens: 'pulse',
      queryKey: 'k1',
      query: { naics: ['332710'] },
      fetchedAt: new Date('2026-06-16T12:00:00.000Z'),
      asOf: '2026-06-15',
      requests: 3,
      payload: { series: [4] },
    });

    expect(await store.find('pulse', 'k1')).toEqual({
      lens: 'pulse',
      queryKey: 'k1',
      query: { naics: ['332710'] },
      fetchedAt: new Date('2026-06-16T12:00:00.000Z'),
      asOf: '2026-06-15',
      requests: 3,
      payload: { series: [4] },
    });
    expect(await store.find('freshness', 'k1')).toMatchObject({ asOf: null, requests: 1 });
    expect(await store.find('pulse', 'k2')).toBeNull();
    expect(await orm.em.fork().count(GovconSpendingSnapshot)).toBe(2);
  });
});
