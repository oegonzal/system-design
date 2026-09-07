/**
 * The embedding cache in Postgres: found by (model, text hash), written
 * `on conflict do nothing` so two runs embedding the same text at once both
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
    const table = this.em.getMetadata().get(MemoryEmbedding).tableName;
    const values = entries.map(() => '(?, ?, ?, ?, now())').join(', ');
    const params = entries.flatMap((entry) => [
      crypto.randomUUID(),
      model,
      entry.hash,
      JSON.stringify(entry.vector),
    ]);
    await this.em
      .fork()
      .getConnection()
      .execute(
        `insert into "${table}" ("id", "model", "content_hash", "embedding", "created_at") values ${values} on conflict ("model", "content_hash") do nothing`,
        params,
      );
  }
}
