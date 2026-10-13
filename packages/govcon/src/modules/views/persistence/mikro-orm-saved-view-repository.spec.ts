import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  GovconSavedView,
  GovconSearchProfile,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { tinyProfile } from '../../../core/testing';
import { MikroOrmProfileRepository } from '../../profiles/persistence/mikro-orm-profile-repository';
import { MikroOrmSavedViewRepository } from './mikro-orm-saved-view-repository';

describe('the saved-view repository in Postgres', () => {
  let orm: MikroORM;
  const t1 = new Date('2026-09-25T10:00:00Z');
  const t2 = new Date('2026-09-26T10:00:00Z');
  const TABLES = [GovconSavedView, GovconSearchProfile];

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
  });

  beforeEach(() => truncateTestTables(orm.em, TABLES));

  afterAll(async () => {
    await truncateTestTables(orm.em, TABLES);
    await orm.close(true);
  });

  it('[GOV-28] saves a view under its name, lands a second save of that name on the same row with the new address, keeps names apart by profile, lists by name, and loses a profile’s views with the profile', async () => {
    const profiles = new MikroOrmProfileRepository(orm.em);
    await profiles.insert(tinyProfile(), true, t1);
    await profiles.insert(tinyProfile({ id: 'second', company: 'Second' }), false, t1);
    const views = new MikroOrmSavedViewRepository(orm.em);

    const kept = await views.save('tiny', { name: 'Who buys', href: '/spending?tab=where' }, t1);
    expect(kept).toEqual({
      id: kept.id,
      profileId: 'tiny',
      name: 'Who buys',
      href: '/spending?tab=where',
      createdAt: t1,
      updatedAt: t1,
    });
    const moved = await views.save('tiny', { name: 'Who buys', href: '/spending?tab=reach' }, t2);
    expect(moved).toEqual({ ...kept, href: '/spending?tab=reach', updatedAt: t2 });
    await views.save('tiny', { name: 'Ending soon', href: '/spending?tab=horizon' }, t1);
    await views.save('second', { name: 'Who buys', href: '/spending' }, t1);

    expect((await views.listByProfile('tiny')).map((view) => [view.name, view.href])).toEqual([
      ['Ending soon', '/spending?tab=horizon'],
      ['Who buys', '/spending?tab=reach'],
    ]);
    expect(await views.listByProfile('second')).toHaveLength(1);

    expect(await views.remove(kept.id)).toBe(true);
    expect(await views.remove(kept.id)).toBe(false);
    await profiles.remove('second');
    expect(await orm.em.fork().count(GovconSavedView, {})).toBe(1);
  });
});
