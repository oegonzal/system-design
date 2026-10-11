import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  BusEvent,
  BusSubscription,
  ensureDatabase,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { APPEND_LOCK, MikroOrmEventLog } from './mikro-orm-event-log';
import { MikroOrmSubscriptionStore } from './mikro-orm-subscription-store';

const AT = new Date('2026-10-11T00:00:00Z');
const later = (ms: number): Date => new Date(AT.getTime() + ms);
const event = (topic = 'interaction.prompted') => ({ topic, source: 'spec', payload: { n: 1 } });

describe('the bus in Postgres', () => {
  let orm: MikroORM;
  let log: MikroOrmEventLog;
  let subscriptions: MikroOrmSubscriptionStore;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    log = new MikroOrmEventLog(orm.em);
    subscriptions = new MikroOrmSubscriptionStore(orm.em);
  });

  afterAll(async () => {
    await truncateTestTables(orm.em.fork(), [BusEvent, BusSubscription]);
    await orm.close(true);
  });

  beforeEach(async () => {
    await truncateTestTables(orm.em.fork(), [BusEvent, BusSubscription]);
  });

  it('[NTF-1] draws seqs in order and serializes appends through one lock, so events commit in seq order', async () => {
    const first = await log.append(event(), AT);
    const second = await log.append(event(), AT);
    expect(BigInt(second.seq)).toBe(BigInt(first.seq) + 1n);
    expect(second).toMatchObject({
      source: 'spec',
      payload: { n: 1 },
      publishedAt: AT.toISOString(),
    });

    // A writer holding the append lock: the next append waits for it to commit.
    const holding = orm.em.fork().transactional(async (em) => {
      await em.execute(`select pg_advisory_xact_lock(${APPEND_LOCK})`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    await log.append(event(), AT);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    await holding;
  });

  it('[NTF-2] reads past a cursor by topic, oldest first, and knows its head', async () => {
    expect(await log.head()).toBe(0n);
    const seqs: string[] = [];
    for (const topic of ['interaction.prompted', 'interaction.answered', 'interaction.prompted']) {
      seqs.push((await log.append(event(topic), AT)).seq);
    }
    const [one, , three] = seqs.map(BigInt);
    expect(await log.head()).toBe(three);
    expect((await log.after(0n, ['interaction.prompted'], 10)).map((e) => e.seq)).toEqual([
      seqs[0],
      seqs[2],
    ]);
    expect((await log.after(one ?? 0n, ['interaction.prompted'], 10)).map((e) => e.seq)).toEqual([
      seqs[2],
    ]);
    expect(await log.after(0n, ['interaction.prompted'], 1)).toHaveLength(1);
  });

  it('[NTF-2] keeps a cursor when a subscription is asked for again, and moves it only forward', async () => {
    const created = await subscriptions.upsert('ask.one', ['interaction.answered'], 7n, AT);
    expect(created).toEqual({ name: 'ask.one', topics: ['interaction.answered'], cursor: '7' });
    const again = await subscriptions.upsert(
      'ask.one',
      ['interaction.answered', 'interaction.withdrawn'],
      9n,
      later(1),
    );
    expect(again).toEqual({
      name: 'ask.one',
      topics: ['interaction.answered', 'interaction.withdrawn'],
      cursor: '7',
    });
    expect((await subscriptions.advance('ask.one', 12n))?.cursor).toBe('12');
    expect((await subscriptions.advance('ask.one', 10n))?.cursor).toBe('12');
    expect(await subscriptions.advance('ask.none', 1n)).toBeNull();
    expect(await subscriptions.find('ask.none')).toBeNull();
  });

  it('[NTF-3] prunes old events below a seq, removes idle subscriptions, and reports the lowest cursor', async () => {
    const seqs: bigint[] = [];
    for (let i = 0; i < 3; i += 1) seqs.push(BigInt((await log.append(event(), AT)).seq));
    const [first, second, third] = seqs as [bigint, bigint, bigint];
    expect(await log.prune(later(1), second)).toBe(1);
    expect(await log.prune(AT, third)).toBe(0);
    expect((await log.after(0n, ['interaction.prompted'], 10)).map((e) => BigInt(e.seq))).toEqual([
      second,
      third,
    ]);
    expect(first).toBeLessThan(second);

    expect(await subscriptions.lowestCursor()).toBeNull();
    await subscriptions.upsert('old', ['interaction.prompted'], 3n, AT);
    await subscriptions.upsert('new', ['interaction.prompted'], 5n, AT);
    await subscriptions.touch('new', later(10_000));
    expect(await subscriptions.lowestCursor()).toBe(3n);
    expect(await subscriptions.removeIdle(later(5_000))).toBe(1);
    expect(await subscriptions.lowestCursor()).toBe(5n);
    expect(await subscriptions.remove('new')).toBe(true);
    expect(await subscriptions.remove('new')).toBe(false);
  });
});
