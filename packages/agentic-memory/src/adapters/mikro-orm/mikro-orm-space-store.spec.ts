import { MikroORM } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  MemorySpace as MemorySpaceRow,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { spaceFixture } from '../../testing/fixtures';
import { spaceStoreContract } from '../../testing/space-store-contract';
import { MikroOrmSpaceStore } from './mikro-orm-space-store';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let orm: MikroORM;

beforeAll(async () => {
  await ensureDatabase();
  orm = await MikroORM.init(ormOptions);
});
afterAll(async () => {
  await orm.close();
});

/** An empty spaces table; the truncate cascades to the records and digests that name a space. */
async function emptyStore(): Promise<MikroOrmSpaceStore> {
  await truncateTestTables(orm.em.fork(), [MemorySpaceRow]);
  return new MikroOrmSpaceStore(orm.em);
}

spaceStoreContract('postgres', emptyStore);

describe('the Postgres space store under concurrent claims', () => {
  it('[AGS-12] keeps one of two spaces claiming one name at once, and answers the other name_taken', async () => {
    const store = await emptyStore();
    const outcomes = await Promise.all(
      [id(1), id(2)].map((each) => store.insert(spaceFixture({ id: each, name: 'alpha' }))),
    );
    expect([...outcomes].sort()).toEqual(['inserted', 'name_taken']);
    expect((await store.findByName('alpha'))?.id).toBe(outcomes[0] === 'inserted' ? id(1) : id(2));
  });
});
