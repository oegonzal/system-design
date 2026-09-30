import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { entityOf } from '@sysdesign/contracts';
import { ensureDatabase, GovconEntity, ormOptions } from '@sysdesign/db';

import { MikroOrmEntityRepository } from './mikro-orm-entity-repository';

describe('the entity repository in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await orm.em.fork().nativeDelete(GovconEntity, {});
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(GovconEntity, {});
    await orm.close(true);
  });

  it('[GOV-18] upserts by UEI, round-trips every column, and finds one or many', async () => {
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
    expect(
      (await repository.findMany(['ZZZ000000001', 'ABC123DEF456', 'NOPE'])).map((e) => e.uei),
    ).toEqual(['ABC123DEF456', 'ZZZ000000001']);
    expect(await repository.findMany([])).toEqual([]);
    expect(await repository.upsertMany([])).toEqual({ inserted: 0, updated: 0 });
  });
});
