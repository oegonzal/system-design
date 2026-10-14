import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  GovconSavedSearch,
  GovconSearchProfile,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { must, tinyProfile } from '../../../core/testing';
import { MikroOrmProfileRepository } from './mikro-orm-profile-repository';
import { MikroOrmSavedSearchRepository } from './mikro-orm-saved-search-repository';

describe('the profile and saved-search repositories in Postgres', () => {
  let orm: MikroORM;
  const t1 = new Date('2026-09-25T10:00:00Z');
  const t2 = new Date('2026-09-26T10:00:00Z');

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
  });

  beforeEach(async () => {
    await truncateTestTables(orm.em, [GovconSavedSearch, GovconSearchProfile]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconSavedSearch, GovconSearchProfile]);
    await orm.close(true);
  });

  it('[GOV-13] stores a document by slug, refuses a taken slug, and keeps one default across the move', async () => {
    const profiles = new MikroOrmProfileRepository(orm.em);
    expect(await profiles.count()).toBe(0);
    expect(await profiles.findDefault()).toBeNull();
    const inserted = await profiles.insert(tinyProfile(), true, t1);
    expect(inserted).toEqual({
      profile: tinyProfile(),
      isDefault: true,
      createdAt: t1,
      updatedAt: t1,
    });
    expect(await profiles.insert(tinyProfile(), false, t1)).toBeNull();
    await profiles.insert(tinyProfile({ id: 'second', company: 'Second' }), false, t1);

    expect((await profiles.list()).map((r) => r.profile.id)).toEqual(['second', 'tiny']);
    expect((await profiles.find('tiny'))?.isDefault).toBe(true);
    expect(await profiles.find('nope')).toBeNull();
    expect((await profiles.update(tinyProfile({ company: 'Renamed' }), t2))?.updatedAt).toEqual(t2);
    expect((await profiles.find('tiny'))?.profile.company).toBe('Renamed');
    expect(await profiles.update(tinyProfile({ id: 'nope' }), t2)).toBeNull();

    expect(await profiles.setDefault('second')).toBe(true);
    expect((await profiles.findDefault())?.profile.id).toBe('second');
    expect((await profiles.find('tiny'))?.isDefault).toBe(false);
    expect(await profiles.setDefault('nope')).toBe(false);
    expect((await profiles.findDefault())?.profile.id).toBe('second');

    expect(await profiles.remove('tiny')).toBe(true);
    expect(await profiles.remove('tiny')).toBe(false);
    expect(await profiles.count()).toBe(1);
  });

  it('[GOV-14] [GOV-37] keeps saved searches per profile by unique name, in pull order, stamped when run with what the run brought in, gone with their profile', async () => {
    const profiles = new MikroOrmProfileRepository(orm.em);
    const searches = new MikroOrmSavedSearchRepository(orm.em);
    await profiles.insert(tinyProfile(), true, t1);
    const input = {
      name: 'Machine shops',
      filter: { naics: '332710' },
      days: 3,
      includedInPull: true,
      pullOrder: 1,
    };
    const first = must(await searches.insert('tiny', input, t1));
    expect(first).toMatchObject({ profileId: 'tiny', ...input, lastRunAt: null, createdAt: t1 });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await searches.insert('tiny', input, t1)).toBeNull();
    const second = must(
      await searches.insert(
        'tiny',
        { ...input, name: 'Software', filter: { naics: '541511', status: 'active' }, pullOrder: 0 },
        t1,
      ),
    );

    expect((await searches.listByProfile('tiny')).map((s) => s.name)).toEqual([
      'Software',
      'Machine shops',
    ]);
    expect((await searches.find(first.id))?.filter).toEqual({ naics: '332710' });
    expect(await searches.find('00000000-0000-0000-0000-000000000000')).toBeNull();

    expect(await searches.update(second.id, { ...input, pullOrder: 9 }, t2)).toBe('conflict');
    expect(
      await searches.update(second.id, { ...input, name: 'Software', includedInPull: false }, t2),
    ).toMatchObject({ includedInPull: false, updatedAt: t2 });
    expect(await searches.update('00000000-0000-0000-0000-000000000000', input, t2)).toBeNull();

    // A run stamps its search; one that read the source leaves what it brought in.
    const brought = {
      at: t2.toISOString(),
      window: { from: '2026-09-23', to: '2026-09-26' },
      received: 37,
      inserted: 5,
      truncated: false,
      tiers: { high: 1, medium: 3, low: 20 },
      unlisted: 13,
    };
    await searches.recordRuns([
      { id: first.id, at: t2, yield: brought },
      { id: second.id, at: t2, yield: null },
    ]);
    expect(await searches.find(first.id)).toMatchObject({ lastRunAt: t2, lastYield: brought });
    expect(await searches.find(second.id)).toMatchObject({ lastRunAt: t2, lastYield: null });
    // A later run that read nothing — the cache window answered — moves the stamp and leaves the yield.
    const t3 = new Date('2026-09-26T16:00:00Z');
    await searches.recordRuns([{ id: first.id, at: t3, yield: null }]);
    expect(await searches.find(first.id)).toMatchObject({ lastRunAt: t3, lastYield: brought });
    await searches.recordRuns([]);
    // A stored yield its schema refuses reads as none: refused, never trusted.
    await orm.em
      .fork()
      .nativeUpdate(GovconSavedSearch, { id: first.id }, { lastYield: { received: 'many' } });
    expect((await searches.find(first.id))?.lastYield).toBeNull();

    expect(await searches.remove(second.id)).toBe(true);
    expect(await searches.remove(second.id)).toBe(false);
    await profiles.remove('tiny');
    expect(await searches.listByProfile('tiny')).toEqual([]);
  });
});
