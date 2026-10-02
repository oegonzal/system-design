import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  GovconBid,
  GovconOpportunity,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { opportunityOf } from '../../../core/testing';
import { MikroOrmBidRepository } from './mikro-orm-bid-repository';
import { MikroOrmOpportunityRepository } from './mikro-orm-opportunity-repository';

describe('the bid repository in Postgres', () => {
  let orm: MikroORM;
  const t1 = new Date('2026-09-25T10:00:00Z');
  const t2 = new Date('2026-09-26T10:00:00Z');

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await truncateTestTables(orm.em, [GovconBid, GovconOpportunity]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconBid, GovconOpportunity]);
    await orm.close(true);
  });

  it('[GOV-12] keeps one bid per notice, joined to it in a listing, moved with the stage, and gone with the notice', async () => {
    const notices = new MikroOrmOpportunityRepository(orm.em);
    const bids = new MikroOrmBidRepository(orm.em);
    await notices.upsertMany(
      [opportunityOf({ noticeId: 'n-1' }), opportunityOf({ noticeId: 'n-2' })],
      t1,
    );
    expect(await bids.find('n-1')).toBeNull();

    const input = {
      stage: 'watching' as const,
      notes: 'first look',
      reminderAt: new Date('2026-10-01T09:00:00Z'),
      estimatedValue: 48000.5,
    };
    const saved = await bids.save('n-1', input, t1);
    expect(saved).toEqual({
      noticeId: 'n-1',
      ...input,
      stageChangedAt: t1,
      createdAt: t1,
      updatedAt: t1,
    });
    expect(await bids.find('n-1')).toEqual(saved);

    const same = await bids.save('n-1', { ...input, notes: 'second look' }, t2);
    expect(same).toMatchObject({ notes: 'second look', stageChangedAt: t1, updatedAt: t2 });
    const moved = await bids.save(
      'n-1',
      { ...input, stage: 'preparing', estimatedValue: null },
      t2,
    );
    expect(moved).toMatchObject({ stage: 'preparing', estimatedValue: null, stageChangedAt: t2 });
    await bids.save('n-2', { ...input, stage: 'watching', reminderAt: null }, t1);

    const [all, total] = await bids.list({ stage: null, limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(all.map((row) => [row.bid.noticeId, row.opportunity.title])).toEqual([
      ['n-1', 'Additive manufacturing of replacement brackets'],
      ['n-2', 'Additive manufacturing of replacement brackets'],
    ]);
    const [watching] = await bids.list({ stage: 'watching', limit: 10, offset: 0 });
    expect(watching.map((row) => row.bid.noticeId)).toEqual(['n-2']);
    expect(
      (await bids.list({ stage: null, limit: 1, offset: 1 }))[0].map((row) => row.bid.noticeId),
    ).toEqual(['n-2']);
    expect((await bids.listAll()).map((row) => row.bid.noticeId)).toEqual(['n-1', 'n-2']);

    expect(await bids.remove('n-2')).toBe(true);
    expect(await bids.remove('n-2')).toBe(false);
    await orm.em.fork().nativeDelete(GovconOpportunity, { noticeId: 'n-1' });
    expect(await bids.find('n-1')).toBeNull();
  });
});
