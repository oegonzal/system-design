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
    const scopeKey = 'a'.repeat(64);
    const key = { kind: 'award-ending' as const, subject: 'CONT_1' };
    const other = { ...key, subject: 'CONT_2' };
    expect(await ledger.raised([key])).toEqual(new Set());
    await ledger.record([
      {
        key,
        scopeKey,
        payload: { externalId: 'CONT_1', daysLeft: 20 },
        position: 0,
        profileId: 'enfav',
        raisedAt: new Date('2026-06-15T12:00:00Z'),
        eventSeq: '12',
        promptId: null,
      },
      {
        key: { kind: 'pulse-above-band', subject: '2026-9' },
        scopeKey,
        payload: { fiscalYear: 2026, period: 9 },
        position: 0,
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

  it('[GOV-32] [GOV-33] keeps an alert found on a tracked award with no scope, keeps what was published with each, and reads them back newest first a page at a time with the total — a row from before payloads were kept reading as none', async () => {
    await truncateTestTables(orm.em, [GovconAlert]);
    const ledger = new MikroOrmAlertLedger(orm.em);
    const at = (day: number) => new Date(`2026-06-${day}T12:00:00Z`);
    const moved = { from: '2026-06-30', to: '2026-07-05', externalId: 'CONT_1' };
    await ledger.record([
      {
        key: { kind: 'award-ending', subject: 'CONT_1' },
        scopeKey: null,
        payload: { externalId: 'CONT_1', scopeKey: null },
        position: 1,
        profileId: 'enfav',
        raisedAt: at(15),
        eventSeq: '1',
        promptId: null,
      },
      {
        key: { kind: 'award-end-moved', subject: 'CONT_1|2026-07-05' },
        scopeKey: null,
        payload: moved,
        position: 0,
        profileId: 'enfav',
        raisedAt: at(15),
        eventSeq: '2',
        promptId: null,
      },
      {
        key: { kind: 'award-notice', subject: 'CONT_1|n-1' },
        scopeKey: null,
        payload: { noticeId: 'n-1' },
        position: 0,
        profileId: 'enfav',
        raisedAt: at(16),
        eventSeq: '3',
        promptId: null,
      },
    ]);
    // A row as the table held it before this column: no payload.
    await orm.em
      .fork()
      .execute(
        `insert into "govcon_alert" (id, kind, subject, scope_key, profile_id, raised_at, event_seq) values ('00000000-0000-4000-8000-000000000009', 'award-ending', 'OLD', ?, 'enfav', '2026-06-10T12:00:00Z', '0')`,
        ['b'.repeat(64)],
      );

    const [rows, total] = await ledger.list({ limit: 10, offset: 0 });
    expect(total).toBe(4);
    // The newest warm first; the two raised in one warm by their place in it, the weightiest first.
    expect(rows.map((row) => [row.key.kind, row.key.subject, row.raisedAt])).toEqual([
      ['award-notice', 'CONT_1|n-1', at(16)],
      ['award-end-moved', 'CONT_1|2026-07-05', at(15)],
      ['award-ending', 'CONT_1', at(15)],
      ['award-ending', 'OLD', at(10)],
    ]);
    expect(rows.map((row) => row.payload)).toEqual([
      { noticeId: 'n-1' },
      moved,
      { externalId: 'CONT_1', scopeKey: null },
      null,
    ]);
    expect(rows.every((row) => row.profileId === 'enfav' && row.id.length === 36)).toBe(true);

    const [second, same] = await ledger.list({ limit: 2, offset: 2 });
    expect(same).toBe(4);
    expect(second.map((row) => row.key.subject)).toEqual(['CONT_1', 'OLD']);
    const stored = await orm.em.fork().find(GovconAlert, { subject: 'CONT_1' });
    expect(stored[0]?.scopeKey).toBeNull();
  });
});
