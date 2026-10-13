import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { alertKeyOf } from '@sysdesign/contracts';
import { ensureDatabase, GovconAlert, ormOptions, truncateTestTables } from '@sysdesign/db';

import { MikroOrmAlertLedger } from './mikro-orm-alert-ledger';

describe('the alert ledger in Postgres', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await truncateTestTables(orm.em, [GovconAlert]);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em, [GovconAlert]);
    await orm.close(true);
  });

  it('[GOV-24] records what was published and answers the raised keys back; an unknown key is not raised, and no keys ask nothing', async () => {
    const ledger = new MikroOrmAlertLedger(orm.em);
    const key = { kind: 'award-ending' as const, scopeKey: 'a'.repeat(64), subject: 'CONT_1' };
    const other = { ...key, subject: 'CONT_2' };
    expect(await ledger.raised([key])).toEqual(new Set());
    await ledger.record([
      {
        key,
        profileId: 'enfav',
        raisedAt: new Date('2026-06-15T12:00:00Z'),
        eventSeq: '12',
        promptId: null,
      },
      {
        key: { kind: 'pulse-above-band', scopeKey: key.scopeKey, subject: '2026-9' },
        profileId: 'enfav',
        raisedAt: new Date('2026-06-15T12:00:00Z'),
        eventSeq: '13',
        promptId: '0f7f1b3e-6d2a-4c58-9a1e-2b3c4d5e6f70',
      },
    ]);
    expect(await ledger.raised([key, other])).toEqual(new Set([alertKeyOf(key)]));
    expect(await ledger.raised([])).toEqual(new Set());
    await ledger.record([]);
    const rows = await orm.em.fork().find(GovconAlert, {}, { orderBy: { eventSeq: 'asc' } });
    expect(rows.map((row) => [row.kind, row.subject, row.eventSeq, row.promptId])).toEqual([
      ['award-ending', 'CONT_1', '12', null],
      ['pulse-above-band', '2026-9', '13', '0f7f1b3e-6d2a-4c58-9a1e-2b3c4d5e6f70'],
    ]);
  });
});
