/**
 * The embedding client behind the cache: a text is embedded once per model
 * and served from the run database after that, across processes. `null`
 * whenever the provider has nothing to say — the caller skips, never fails.
 */
import type { EmbeddingClient } from '@sysdesign/llm';

import { contentHash } from './compose';
import type { EmbeddingCache } from './ports';

export interface Embedded {
  vectors: number[][];
  /** How many texts the provider was actually asked for. */
  misses: number;
}

export class CachedEmbeddings {
  constructor(
    private readonly client: EmbeddingClient,
    private readonly cache: EmbeddingCache,
  ) {}

  get enabled(): boolean {
    return this.client.enabled && this.client.model !== null;
  }

  get model(): string | null {
    return this.client.model;
  }

  get dimensions(): number {
    return this.client.dimensions;
  }

  async embed(texts: readonly string[]): Promise<Embedded | null> {
    const model = this.client.model;
    if (!this.client.enabled || model === null) return null;
    const hashes = texts.map(contentHash);
    const known = await this.cache.find(model, [...new Set(hashes)]);
    const missing = [...new Set(hashes.filter((hash) => !known.has(hash)))];
    if (missing.length > 0) {
      const byHash = new Map(hashes.map((hash, index) => [hash, texts[index]]));
      const fresh = await this.client.embed(missing.map((hash) => byHash.get(hash) ?? ''));
      if (fresh === null) return null;
      const entries = missing.map((hash, index) => ({ hash, vector: fresh[index] }));
      await this.cache.save(model, entries);
      for (const entry of entries) known.set(entry.hash, entry.vector);
    }
    return { vectors: hashes.map((hash) => known.get(hash) ?? []), misses: missing.length };
  }
}
