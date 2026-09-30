import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, GovconSourceCall, ormOptions } from '@sysdesign/db';

import type { SourceCall } from '../../../core/ports';
import { MikroOrmSourceCallLog } from './mikro-orm-source-call-log';

describe('the source call log in Postgres', () => {
  let orm: MikroORM;
  const t0 = new Date('2026-09-26T08:00:00Z');
  const hour = 60 * 60 * 1000;
  const at = (hours: number) => new Date(t0.getTime() + hours * hour);

  const call = (overrides: Partial<SourceCall>): SourceCall => ({
    source: 'sam.gov',
    operation: 'search',
    attempt: 1,
    queryKey: 'k1',
    query: { postedFrom: '2026-09-20', postedTo: '2026-09-26', limit: 1000, offset: 0 },
    requestedAt: t0,
    durationMs: 120,
    status: 200,
    outcome: 'ok',
    totalRecords: 12,
    recordCount: 12,
    error: null,
    ...overrides,
  });

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await orm.em.fork().nativeDelete(GovconSourceCall, {});
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(GovconSourceCall, {});
    await orm.close(true);
  });

  it('[GOV-2] finds the latest successful call for a key inside the window, and counts every attempt since a time', async () => {
    const log = new MikroOrmSourceCallLog(orm.em);
    await log.record(call({ requestedAt: at(0), recordCount: 12 }));
    await log.record(
      call({
        requestedAt: at(1),
        outcome: 'error',
        status: 500,
        error: 'status 500',
        totalRecords: null,
        recordCount: null,
      }),
    );
    await log.record(call({ requestedAt: at(2), recordCount: 15, totalRecords: 15 }));
    await log.record(call({ requestedAt: at(3), queryKey: 'k2' }));
    await log.record(call({ requestedAt: at(3), source: 'other' }));

    expect(await log.findFresh('sam.gov', 'k1', at(-1))).toEqual({
      requestedAt: at(2),
      totalRecords: 15,
      recordCount: 15,
    });
    expect(await log.findFresh('sam.gov', 'k1', at(2.5))).toBeNull();
    expect(await log.findFresh('sam.gov', 'k9', at(-1))).toBeNull();
    expect(await log.findFresh('other', 'k1', at(-1))).toMatchObject({ requestedAt: at(3) });

    expect(await log.countSince('sam.gov', at(-1))).toBe(4);
    expect(await log.countSince('sam.gov', at(1))).toBe(3);
    expect(await log.countSince('sam.gov', at(4))).toBe(0);

    const stored = await orm.em.fork().findOne(GovconSourceCall, { outcome: 'error' });
    expect(stored?.query).toEqual(call({}).query);
    expect(stored?.operation).toBe('search');
    expect(JSON.stringify(stored?.query)).not.toContain('api_key');
  });

  it('[GOV-9] lists newest first with the total, and a description row never answers a fresh search', async () => {
    const log = new MikroOrmSourceCallLog(orm.em);
    await log.record(
      call({
        requestedAt: at(5),
        operation: 'description',
        queryKey: 'k1',
        query: { noticeId: 'n-1' },
        totalRecords: null,
        recordCount: 1,
      }),
    );
    // Same key and window as the fresh search above, but a description: not a search hit.
    expect(await log.findFresh('sam.gov', 'k1', at(4))).toBeNull();

    const [page, total] = await log.list(2, 0);
    expect(total).toBe(6);
    expect(page.map((row) => [row.operation, row.requestedAt])).toEqual([
      ['description', at(5)],
      ['search', at(3)],
    ]);
    expect(page[0]).toMatchObject({ query: { noticeId: 'n-1' }, outcome: 'ok', recordCount: 1 });
    expect(page[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    const [rest, sameTotal] = await log.list(10, 2);
    expect(sameTotal).toBe(6);
    expect(rest).toHaveLength(4);
  });
});
