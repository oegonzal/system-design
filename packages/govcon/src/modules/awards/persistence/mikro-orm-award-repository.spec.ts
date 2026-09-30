import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { awardOf } from '@sysdesign/contracts';
import { ensureDatabase, GovconAward, ormOptions } from '@sysdesign/db';

import type { AwardFilter } from '../../../core/ports';
import { MikroOrmAwardRepository } from './mikro-orm-award-repository';

describe('the award repository in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await orm.em.fork().nativeDelete(GovconAward, {});
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(GovconAward, {});
    await orm.close(true);
  });

  it('[GOV-17] upserts by source and id, round-trips every column, filters and pages newest first, and answers the history', async () => {
    const repository = new MikroOrmAwardRepository(orm.em);
    const first = awardOf({ externalId: 'a', signedAt: '2026-06-01' });
    expect(
      await repository.upsertMany([
        first,
        awardOf({
          externalId: 'b',
          signedAt: '2026-07-01',
          naicsCode: '541511',
          pscCode: 'DA01',
          amount: 1234.56,
          offersReceived: null,
          awardeeUei: null,
          setAsideCode: null,
          completionAt: null,
          placeOfPerformance: null,
        }),
        first,
      ]),
    ).toEqual({ inserted: 2, updated: 0 });
    expect(
      await repository.upsertMany([
        { ...first, amount: 99 },
        awardOf({
          externalId: 'a',
          source: 'usaspending',
          signedAt: '2026-08-01',
          agencyPath: 'Department of Defense.Department of the Navy',
        }),
      ]),
    ).toEqual({ inserted: 1, updated: 1 });

    const [all, total] = await repository.list(
      {
        naicsPrefix: null,
        pscPrefix: null,
        agencyContains: null,
        solicitationNumber: null,
        awardeeUei: null,
        signedFrom: null,
        signedTo: null,
        source: null,
      },
      10,
      0,
    );
    expect(total).toBe(3);
    expect(all.map((a) => [a.source, a.externalId, a.signedAt])).toEqual([
      ['usaspending', 'a', '2026-08-01'],
      ['sam.gov', 'b', '2026-07-01'],
      ['sam.gov', 'a', '2026-06-01'],
    ]);
    expect(all[2]).toEqual({ ...first, amount: 99 });
    expect(all[1]?.amount).toBe(1234.56);

    const none: AwardFilter = {
      naicsPrefix: null,
      pscPrefix: null,
      agencyContains: null,
      solicitationNumber: null,
      awardeeUei: null,
      signedFrom: null,
      signedTo: null,
      source: null,
    };
    const ids = async (filter: Partial<typeof none>) =>
      (await repository.findMatching({ ...none, ...filter }, 10)).map(
        (a) => `${a.source}:${a.externalId}`,
      );
    expect(await ids({ naicsPrefix: '5415' })).toEqual(['sam.gov:b']);
    expect(await ids({ pscPrefix: 'DA' })).toEqual(['sam.gov:b']);
    expect(await ids({ agencyContains: 'navy' })).toEqual(['usaspending:a']);
    expect(await ids({ solicitationNumber: 'SPE4A7-26-Q-0001' })).toHaveLength(3);
    expect(await ids({ awardeeUei: 'ABC123DEF456' })).toHaveLength(2);
    expect(await ids({ signedFrom: '2026-07-01', signedTo: '2026-07-31' })).toEqual(['sam.gov:b']);
    expect(await ids({ source: 'usaspending' })).toEqual(['usaspending:a']);
    expect((await repository.list(none, 1, 1))[0].map((a) => a.externalId)).toEqual(['b']);

    expect(
      (await repository.history('2026-07-01')).map((row) => [row.naicsCode, row.signedAt]).sort(),
    ).toEqual([
      ['332710', '2026-08-01'],
      ['541511', '2026-07-01'],
    ]);
  });
});
