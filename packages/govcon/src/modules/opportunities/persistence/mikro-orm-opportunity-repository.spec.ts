import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, GovconOpportunity, ormOptions, truncateTestTables } from '@sysdesign/db';

import type { CandidateFilter } from '../../../core/ports';
import { opportunityOf } from '../../../core/testing';
import { MikroOrmOpportunityRepository } from './mikro-orm-opportunity-repository';

describe('the opportunity repository in Postgres', () => {
  let orm: MikroORM;
  const t1 = new Date('2026-09-25T10:00:00Z');
  const t2 = new Date('2026-09-26T10:00:00Z');

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await truncateTestTables(orm.em, [GovconOpportunity]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconOpportunity]);
    await orm.close(true);
  });

  it('[GOV-6] upserts by notice id: counts inserts and updates, holds first_seen_at, advances last_seen_at, tolerates duplicates in a batch', async () => {
    const repository = new MikroOrmOpportunityRepository(orm.em);

    expect(
      await repository.upsertMany(
        [opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b' })],
        t1,
      ),
    ).toEqual({
      inserted: 2,
      updated: 0,
    });

    const second = await repository.upsertMany(
      [
        opportunityOf({ noticeId: 'a', title: 'Renamed' }),
        opportunityOf({ noticeId: 'c' }),
        opportunityOf({ noticeId: 'a', title: 'Renamed twice' }),
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

    expect(await repository.upsertMany([], t2)).toEqual({ inserted: 0, updated: 0 });
    expect(await repository.findOne('a')).toMatchObject({ noticeId: 'a', title: 'Renamed twice' });
    expect(await repository.findOne('zzz')).toBeNull();
  });

  it('[GOV-9] [GOV-6] stores a description once, finds it back, and keeps it through a re-pull', async () => {
    const repository = new MikroOrmOpportunityRepository(orm.em);
    await truncateTestTables(orm.em, [GovconOpportunity]);
    await repository.upsertMany([opportunityOf({ noticeId: 'd' })], t1);
    expect(await repository.findDescription('d')).toBeNull();
    expect(await repository.findDescription('missing')).toBeNull();

    const fetchedAt = new Date('2026-09-26T15:00:00Z');
    await repository.saveDescription('d', { text: 'Bracket, 400 each', fetchedAt });
    expect(await repository.findDescription('d')).toEqual({ text: 'Bracket, 400 each', fetchedAt });

    await repository.upsertMany([opportunityOf({ noticeId: 'd', title: 'Re-pulled' })], t2);
    expect(await repository.findOne('d')).toMatchObject({ title: 'Re-pulled' });
    expect(await repository.findDescription('d')).toMatchObject({ text: 'Bracket, 400 each' });
  });

  it('[GOV-6] [GOV-15] filters candidates in SQL — activity, deadlines, set-asides, types, a code family or an exact code set, text — newest first and bounded', async () => {
    const repository = new MikroOrmOpportunityRepository(orm.em);
    await truncateTestTables(orm.em, [GovconOpportunity]);
    await repository.upsertMany(
      [
        opportunityOf({ noticeId: 'open', postedAt: '2026-09-20T00:00:00.000Z' }),
        opportunityOf({
          noticeId: 'unknown',
          active: null,
          responseDeadlineAt: null,
          postedAt: '2026-09-21T00:00:00.000Z',
          setAsideCode: null,
          naicsCode: '541511',
          title: 'Custom software for the depot',
        }),
        opportunityOf({
          noticeId: 'inactive',
          active: false,
          postedAt: '2026-09-22T00:00:00.000Z',
        }),
        opportunityOf({
          noticeId: 'closed',
          responseDeadlineAt: '2026-09-01T00:00:00.000Z',
          postedAt: '2026-09-23T00:00:00.000Z',
        }),
        opportunityOf({
          noticeId: 'hubzone',
          setAsideCode: 'HZC',
          postedAt: '2026-09-24T00:00:00.000Z',
        }),
        opportunityOf({
          noticeId: 'awarded',
          noticeType: 'Award Notice',
          postedAt: '2026-09-25T00:00:00.000Z',
        }),
      ],
      t1,
    );
    await repository.saveDescription('open', { text: 'never loaded by a ranking', fetchedAt: t1 });
    const cutoff = new Date('2026-09-26T00:00:00Z');
    const base: CandidateFilter = {
      activeOnly: true,
      postedOnOrAfter: null,
      deadlineOnOrAfter: cutoff,
      deadlineOnOrBefore: null,
      setAsideCodes: ['SBA', 'SBP'],
      excludeNoticeTypes: ['Award Notice'],
      naicsPrefix: null,
      naicsCodes: null,
      setAsideCode: null,
      noticeTypes: null,
      agencyContains: null,
      textContains: null,
      limit: 100,
    };
    const ids = async (filter: Partial<CandidateFilter>) =>
      (await repository.findCandidates({ ...base, ...filter })).opportunities.map(
        (o) => o.noticeId,
      );

    expect(await ids({})).toEqual(['unknown', 'open']);
    expect(await ids({ activeOnly: false })).toEqual(['inactive', 'unknown', 'open']);
    expect(await ids({ postedOnOrAfter: new Date('2026-09-21T00:00:00Z') })).toEqual(['unknown']);
    expect(await ids({ deadlineOnOrAfter: null })).toEqual(['closed', 'unknown', 'open']);
    expect(await ids({ setAsideCodes: null, excludeNoticeTypes: [] })).toEqual([
      'awarded',
      'hubzone',
      'unknown',
      'open',
    ]);
    expect(await ids({ deadlineOnOrBefore: new Date('2026-10-31T00:00:00Z') })).toEqual(['open']);
    expect(await ids({ naicsPrefix: '5415' })).toEqual(['unknown']);
    expect(await ids({ naicsPrefix: '33' })).toEqual(['open']);
    expect(await ids({ naicsCodes: ['541511', '999999'] })).toEqual(['unknown']);
    expect(await ids({ naicsCodes: [] })).toEqual([]);
    expect(await ids({ setAsideCode: 'SBA' })).toEqual(['open']);
    expect(await ids({ noticeTypes: ['Solicitation'] })).toEqual(['unknown', 'open']);
    // Any of the types named; the profile's exclusion still stands; none named matches nothing.
    expect(
      await ids({ noticeTypes: ['Award Notice', 'Solicitation'], excludeNoticeTypes: [] }),
    ).toEqual(['awarded', 'unknown', 'open']);
    expect(await ids({ noticeTypes: ['Award Notice'] })).toEqual([]);
    expect(await ids({ noticeTypes: ['Presolicitation'] })).toEqual([]);
    expect(await ids({ noticeTypes: [] })).toEqual([]);
    expect(await ids({ agencyContains: 'dla aviation' })).toEqual(['unknown', 'open']);
    expect(await ids({ textContains: 'SOFTWARE' })).toEqual(['unknown']);
    expect(await ids({ textContains: 'SPE4A7-26' })).toEqual(['unknown', 'open']);
    expect(await ids({ textContains: '100%' })).toEqual([]);

    const capped = await repository.findCandidates({ ...base, limit: 1 });
    expect(capped.opportunities.map((o) => o.noticeId)).toEqual(['unknown']);
    expect(capped.capped).toBe(true);
    expect((await repository.findCandidates(base)).capped).toBe(false);
  });
});
