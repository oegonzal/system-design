import { EntityManager } from '@mikro-orm/postgresql';
import { MikroORM } from '@mikro-orm/postgresql';
import { MemoryDesignCycle, ormOptions, truncateTestTables } from '@sysdesign/db';
import { ensureDatabase } from '@sysdesign/db';

import { MikroOrmCycleStore } from './mikro-orm-cycle-store';
import type { MemoryDesignCycle as Cycle } from '../cycle';

const cycle = (over: Partial<Cycle> = {}): Cycle => ({
  id: crypto.randomUUID(),
  goalDigest: 'g1',
  status: 'running',
  designRunId: null,
  orchestrationRunId: null,
  note: null,
  startedAt: new Date('2026-10-16T00:00:00Z'),
  updatedAt: new Date('2026-10-16T00:00:00Z'),
  ...over,
});

describe('the MikroORM cycle store', () => {
  let orm: MikroORM;
  let store: MikroOrmCycleStore;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init(ormOptions);
    store = new MikroOrmCycleStore(orm.em as EntityManager);
  });
  afterAll(async () => {
    await orm.close();
  });
  beforeEach(async () => {
    await truncateTestTables(orm.em.fork(), [MemoryDesignCycle]);
  });

  it('[AGS-2] inserts, finds and merges a patch against the real table', async () => {
    const c = cycle({ id: '11111111-1111-1111-1111-111111111111' });
    await store.insert(c);
    expect((await store.find(c.id))?.status).toBe('running');

    const merged = await store.update(c.id, { status: 'coached', designRunId: 'run-1' });
    expect(merged).toMatchObject({ status: 'coached', designRunId: 'run-1', goalDigest: 'g1' });
    expect(
      await store.update('22222222-2222-2222-2222-222222222222', { status: 'stored' }),
    ).toBeNull();
  });
});
