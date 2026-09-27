import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, GovconOpportunity, ormOptions } from '@sysdesign/db';

import { fetched } from '../../../core/testing';
import { MikroOrmOpportunityRepository } from './mikro-orm-opportunity-repository';

describe('the opportunity repository in Postgres', () => {
  let orm: MikroORM;
  const t1 = new Date('2026-09-25T10:00:00Z');
  const t2 = new Date('2026-09-26T10:00:00Z');

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await orm.em.fork().nativeDelete(GovconOpportunity, {});
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(GovconOpportunity, {});
    await orm.close(true);
  });

  it('[GOV-6] upserts by notice id: counts inserts and updates, holds first_seen_at, advances last_seen_at, tolerates duplicates in a batch', async () => {
    const repository = new MikroOrmOpportunityRepository(orm.em);

    expect(
      await repository.upsertMany([fetched({ noticeId: 'a' }), fetched({ noticeId: 'b' })], t1),
    ).toEqual({
      inserted: 2,
      updated: 0,
    });

    const second = await repository.upsertMany(
      [
        fetched({ noticeId: 'a', title: 'Renamed' }),
        fetched({ noticeId: 'c' }),
        fetched({ noticeId: 'a', title: 'Renamed twice' }),
      ],
      t2,
    );
    expect(second).toEqual({ inserted: 1, updated: 1 });

    const rows = await orm.em.fork().find(GovconOpportunity, {}, { orderBy: { noticeId: 'asc' } });
    expect(rows.map((row) => row.noticeId)).toEqual(['a', 'b', 'c']);
    const a = rows[0];
    expect(a?.title).toBe('Renamed twice');
    expect(a?.firstSeenAt).toEqual(t1);
    expect(a?.lastSeenAt).toEqual(t2);
    expect(rows[1]?.lastSeenAt).toEqual(t1);
    expect(rows[2]?.firstSeenAt).toEqual(t2);
    expect(a?.raw).toEqual({ noticeId: 'a', title: 'Renamed twice' });

    expect(await repository.upsertMany([], t2)).toEqual({ inserted: 0, updated: 0 });
    expect(await repository.findOne('a')).toMatchObject({ noticeId: 'a', title: 'Renamed twice' });
    expect(await repository.findOne('zzz')).toBeNull();
  });

  it('[GOV-6] finds candidates by activity and deadline, unknowns kept, newest first', async () => {
    const repository = new MikroOrmOpportunityRepository(orm.em);
    await orm.em.fork().nativeDelete(GovconOpportunity, {});
    await repository.upsertMany(
      [
        fetched({ noticeId: 'open', postedAt: '2026-09-20T00:00:00.000Z' }),
        fetched({
          noticeId: 'unknown',
          active: null,
          responseDeadlineAt: null,
          postedAt: '2026-09-21T00:00:00.000Z',
        }),
        fetched({ noticeId: 'inactive', active: false, postedAt: '2026-09-22T00:00:00.000Z' }),
        fetched({
          noticeId: 'closed',
          responseDeadlineAt: '2026-09-01T00:00:00.000Z',
          postedAt: '2026-09-23T00:00:00.000Z',
        }),
      ],
      t1,
    );
    const cutoff = new Date('2026-09-26T00:00:00Z');
    const ids = (rows: { noticeId: string }[]) => rows.map((row) => row.noticeId);

    expect(
      ids(await repository.findCandidates({ activeOnly: true, deadlineOnOrAfter: cutoff })),
    ).toEqual(['unknown', 'open']);
    expect(
      ids(await repository.findCandidates({ activeOnly: false, deadlineOnOrAfter: cutoff })),
    ).toEqual(['inactive', 'unknown', 'open']);
    expect(
      ids(await repository.findCandidates({ activeOnly: true, deadlineOnOrAfter: null })),
    ).toEqual(['closed', 'unknown', 'open']);
    expect(
      ids(await repository.findCandidates({ activeOnly: false, deadlineOnOrAfter: null })),
    ).toHaveLength(4);
  });
});
