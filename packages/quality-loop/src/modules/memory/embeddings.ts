/**
 * The embedding client behind the cache: a text is embedded once per model
 * and served from the run database after that, across processes. `null`
 * whenever the provider has nothing to say — the caller skips, never fails.
 *
 * The cache is an optimisation, never a dependency: a database that cannot
 * answer degrades to a provider call, and one that cannot record degrades to
 * embedding the same text again next time. Only the provider itself returning
 * nothing is a `null`, because only then is there no vector to hand back.
 */
import type { EmbeddingClient } from '@sysdesign/llm';
import { describeError } from '@sysdesign/run-dump';

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
    private readonly warn: (message: string) => void = () => undefined,
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
    const known = await this.find(model, [...new Set(hashes)]);
    const missing = [...new Set(hashes.filter((hash) => !known.has(hash)))];
    if (missing.length > 0) {
      const byHash = new Map(hashes.map((hash, index) => [hash, texts[index]]));
      const fresh = await this.client.embed(missing.map((hash) => byHash.get(hash) ?? ''));
      if (fresh === null) return null;
      const entries = missing.map((hash, index) => ({ hash, vector: fresh[index] }));
      await this.save(model, entries);
      for (const entry of entries) known.set(entry.hash, entry.vector);
    }
    return { vectors: hashes.map((hash) => known.get(hash) ?? []), misses: missing.length };
  }

  /** A cache that cannot answer is an empty one: the provider is asked instead. */
  private async find(model: string, hashes: string[]): Promise<Map<string, number[]>> {
    try {
      return await this.cache.find(model, hashes);
    } catch (error) {
      this.warn(`embedding cache not read: ${describeError(error).message}`);
      return new Map();
    }
  }

  /** A cache that cannot record costs a re-embed later, never this call's vectors. */
  private async save(
    model: string,
    entries: readonly { hash: string; vector: number[] }[],
  ): Promise<void> {
    try {
      await this.cache.save(model, entries);
    } catch (error) {
      this.warn(`embedding cache not written: ${describeError(error).message}`);
    }
  }
}
