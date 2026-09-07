import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, MemoryEmbedding, ormOptions } from '@sysdesign/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MikroOrmEmbeddingCache } from './mikro-orm-embedding-cache';

describe('the embedding cache in the run database', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    await orm.em.fork().nativeDelete(MemoryEmbedding, {});
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(MemoryEmbedding, {});
    await orm.close(true);
  });

  it('[QL-17] finds by model and text hash, saves once, and keeps models apart', async () => {
    const cache = new MikroOrmEmbeddingCache(orm.em);
    const hash = 'a'.repeat(64);
    expect(await cache.find('m1', [hash])).toEqual(new Map());
    expect(await cache.find('m1', [])).toEqual(new Map());

    await cache.save('m1', [
      { hash, vector: [0.1, 0.2] },
      { hash: 'b'.repeat(64), vector: [0.3] },
    ]);
    await cache.save('m1', [{ hash, vector: [9, 9] }]);
    expect(await cache.find('m1', [hash, 'c'.repeat(64)])).toEqual(new Map([[hash, [0.1, 0.2]]]));
    expect(await cache.find('m2', [hash])).toEqual(new Map());
    expect(await orm.em.fork().count(MemoryEmbedding)).toBe(2);
  });
});
