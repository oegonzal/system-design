import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { entityOf } from '@sysdesign/contracts';
import { ensureDatabase, GovconEntity, ormOptions, truncateTestTables } from '@sysdesign/db';

import { MikroOrmEntityRepository } from './mikro-orm-entity-repository';

describe('the entity repository in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await truncateTestTables(orm.em, [GovconEntity]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconEntity]);
    await orm.close(true);
  });

  it('[GOV-18] upserts by UEI, round-trips every column, and finds one by its UEI', async () => {
    const repository = new MikroOrmEntityRepository(orm.em);
    const first = entityOf();
    expect(
      await repository.upsertMany([
        first,
        entityOf({
          uei: 'ZZZ000000001',
          legalName: 'Other',
          registrationExpiresAt: null,
          cage: null,
          excluded: true,
        }),
      ]),
    ).toEqual({ inserted: 2, updated: 0 });
    expect(await repository.upsertMany([{ ...first, registrationStatus: 'Expired' }])).toEqual({
      inserted: 0,
      updated: 1,
    });
    expect(await repository.find('ABC123DEF456')).toEqual({
      ...first,
      registrationStatus: 'Expired',
    });
    expect(await repository.find('NOPE')).toBeNull();
    expect((await repository.find('ZZZ000000001'))?.excluded).toBe(true);
    expect(await repository.upsertMany([])).toEqual({ inserted: 0, updated: 0 });
  });
});
