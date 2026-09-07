/**
 * The embedding cache in Postgres: found by (model, text hash), written with
 * the conflict ignored so two runs embedding the same text at once both
 * succeed. Vectors here are only ever read back whole, hence jsonb.
 */
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MemoryEmbedding } from '@sysdesign/db';

import type { EmbeddingCache } from '../ports';

@Injectable()
export class MikroOrmEmbeddingCache implements EmbeddingCache {
  constructor(private readonly em: EntityManager) {}

  async find(model: string, hashes: readonly string[]): Promise<Map<string, number[]>> {
    if (hashes.length === 0) return new Map();
    const rows = await this.em
      .fork()
      .find(MemoryEmbedding, { model, contentHash: { $in: [...hashes] } });
    return new Map(rows.map((row) => [row.contentHash, row.embedding]));
  }

  async save(model: string, entries: readonly { hash: string; vector: number[] }[]): Promise<void> {
    if (entries.length === 0) return;
    await this.em.fork().upsertMany(
      MemoryEmbedding,
      // Raw data skips the entity's initializers: the id and stamp are supplied here.
      entries.map((entry) => ({
        id: crypto.randomUUID(),
        model,
        contentHash: entry.hash,
        embedding: entry.vector,
        createdAt: new Date(),
      })),
      { onConflictFields: ['model', 'contentHash'], onConflictAction: 'ignore' },
    );
  }
}
