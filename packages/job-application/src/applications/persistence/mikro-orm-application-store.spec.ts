import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, JobApplication, ormOptions, truncateTestTables } from '@sysdesign/db';

import { application } from '../testing';
import { MikroOrmApplicationStore } from './mikro-orm-application-store';

const at = (day: string): Date => new Date(`${day}T10:00:00.000Z`);
const SUBJECT = 'Alex Example';

describe('the record in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
  });

  beforeEach(async () => {
    await truncateTestTables(orm.em, [JobApplication]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [JobApplication]);
    await orm.close(true);
  });

  it('[JA-5] keys a row by the unit’s id and inserts it once, matches a company by its key whatever the spelling, and reads what moved since a date latest first', async () => {
    const store = new MikroOrmApplicationStore(orm.em);
    const acme = application({
      company: 'Acme',
      openedAt: at('2026-10-01'),
      closedAt: at('2026-10-01'),
    });
    expect(await store.insert(acme)).toBe(true);
    expect(await store.insert({ ...acme, company: 'Other' })).toBe(false);
    expect(await store.find(acme.id)).toEqual(acme);
    const later = application({
      company: 'ACME ',
      openedAt: at('2026-10-05'),
      closedAt: at('2026-10-05'),
    });
    const open = application({
      company: 'Globex',
      status: 'in-progress',
      sessionId: 'session-2',
      openedAt: at('2026-10-06'),
      closedAt: null,
      expiresAt: at('2026-10-07'),
    });
    const old = application({
      company: 'Old Co',
      openedAt: at('2026-01-01'),
      closedAt: at('2026-01-01'),
    });
    for (const row of [later, open, old]) await store.insert(row);

    expect((await store.since(SUBJECT, at('2026-09-01'))).map((row) => row.id)).toEqual([
      open.id,
      later.id,
      acme.id,
    ]);
    const paged = (query: Parameters<typeof store.list>[0]) =>
      store.list(query).then((rows) => rows.map((row) => row.id));
    expect(await paged({ subject: SUBJECT, company: 'acme', limit: 10, offset: 0 })).toEqual([
      later.id,
      acme.id,
    ]);
    expect(await paged({ subject: SUBJECT, status: 'in-progress', limit: 10, offset: 0 })).toEqual([
      open.id,
    ]);
    expect(await paged({ subject: SUBJECT, since: at('2026-10-02'), limit: 1, offset: 1 })).toEqual(
      [later.id],
    );
    expect(await paged({ subject: 'Someone Else', limit: 10, offset: 0 })).toEqual([]);
  });

  it('[JA-5] finds what is in progress for a session, or for a profile and subject but another session; a terminal status clears the expiry; the vocabularies hold in the table', async () => {
    const store = new MikroOrmApplicationStore(orm.em);
    const mine = application({
      company: 'Initech',
      status: 'in-progress',
      sessionId: 'session-3',
      closedAt: null,
      expiresAt: at('2026-10-12'),
    });
    const theirs = application({
      company: 'Hooli',
      status: 'in-progress',
      sessionId: 'session-4',
      closedAt: null,
      expiresAt: at('2026-10-12'),
    });
    const elsewhere = application({
      company: 'Umbrella',
      status: 'in-progress',
      sessionId: 'session-5',
      profile: 'other-profile',
      closedAt: null,
      expiresAt: at('2026-10-12'),
    });
    const done = application({ company: 'Acme', sessionId: 'session-3' });
    for (const row of [mine, theirs, elsewhere, done]) await store.insert(row);

    expect((await store.inProgress({ sessionId: 'session-3' })).map((row) => row.id)).toEqual([
      mine.id,
    ]);
    expect(
      (
        await store.inProgress({ profile: 'spec', subject: SUBJECT, exceptSessionId: 'session-3' })
      ).map((row) => row.id),
    ).toEqual([theirs.id]);
    await store.setStatus(mine.id, 'submitted', at('2026-10-11'));
    expect(await store.find(mine.id)).toMatchObject({
      status: 'submitted',
      closedAt: at('2026-10-11'),
      expiresAt: null,
    });
    await expect(store.insert(application({ status: 'interviewing' as never }))).rejects.toThrow(
      /job_application_status_check/,
    );
    await expect(store.insert(application({ source: 'import' as never }))).rejects.toThrow(
      /job_application_source_check/,
    );
  });
});
