import { randomUUID } from 'node:crypto';

import { MikroORM } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  MemorySpace,
  MemorySpaceDigest,
  ormOptions,
  truncateTestTables,
} from '@sysdesign/db';

import { digestLedgerContract } from './digest-ledger-contract';
import { MikroOrmDigestLedger } from './mikro-orm-digest-ledger';

let orm: MikroORM;

beforeAll(async () => {
  await ensureDatabase();
  orm = await MikroORM.init(ormOptions);
});
afterAll(async () => {
  await orm.close();
});

/** Empty tables and one space in them: every apply names its space by a foreign key. */
async function ledgerOverOneSpace(): Promise<{ ledger: MikroOrmDigestLedger; spaceId: string }> {
  await truncateTestTables(orm.em.fork(), [MemorySpaceDigest, MemorySpace]);
  const spaceId = randomUUID();
  await orm.em.fork().insert(MemorySpace, {
    id: spaceId,
    designRunId: 'run-under-test',
    strategy: {},
    policy: {},
    policySource: 'spec',
    createdAt: new Date('2026-10-18T00:00:00.000Z'),
  });
  return { ledger: new MikroOrmDigestLedger(orm.em), spaceId };
}

digestLedgerContract('postgres', ledgerOverOneSpace);
