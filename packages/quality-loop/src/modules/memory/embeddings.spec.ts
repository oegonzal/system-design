import { describe, expect, it } from 'vitest';

import { CachedEmbeddings } from './embeddings';
import type { EmbeddingCache } from './ports';
import { fakeEmbeddings, InMemoryEmbeddingCache, vectorOf } from './testing';

/** A cache that is present but broken — the case a run must survive. */
const brokenCache = (broken: 'find' | 'save'): EmbeddingCache => {
  const working = new InMemoryEmbeddingCache();
  return {
    find: (model, hashes) =>
      broken === 'find'
        ? Promise.reject(new Error('connect ECONNREFUSED'))
        : working.find(model, hashes),
    save: (model, entries) =>
      broken === 'save'
        ? Promise.reject(new Error('deadlock detected'))
        : working.save(model, entries),
  };
};

describe('the embedding cache is an optimisation, never a dependency', () => {
  it('embeds through a cache that cannot be read, and says so once', async () => {
    const warnings: string[] = [];
    const client = fakeEmbeddings();
    const embeddings = new CachedEmbeddings(client, brokenCache('find'), (message) =>
      warnings.push(message),
    );

    const embedded = await embeddings.embed(['a latency budget across a vendor hop']);

    expect(embedded).not.toBeNull();
    expect(embedded?.vectors).toEqual([vectorOf('a latency budget across a vendor hop')]);
    expect(embedded?.misses).toBe(1);
    expect(client.calls).toHaveLength(1);
    expect(warnings).toEqual([expect.stringContaining('embedding cache not read')]);
  });

  it('keeps the vectors it just paid for when the cache cannot be written', async () => {
    const warnings: string[] = [];
    const embeddings = new CachedEmbeddings(fakeEmbeddings(), brokenCache('save'), (message) =>
      warnings.push(message),
    );

    const embedded = await embeddings.embed(['one', 'two']);

    expect(embedded?.vectors).toEqual([vectorOf('one'), vectorOf('two')]);
    expect(warnings).toEqual([expect.stringContaining('embedding cache not written')]);
  });

  it('still returns null when the provider itself has nothing to say', async () => {
    const silent = { ...fakeEmbeddings(), embed: () => Promise.resolve(null) };
    const embeddings = new CachedEmbeddings(silent, new InMemoryEmbeddingCache());

    expect(await embeddings.embed(['anything'])).toBeNull();
  });

  it('asks the provider once for a text it has already embedded', async () => {
    const client = fakeEmbeddings();
    const embeddings = new CachedEmbeddings(client, new InMemoryEmbeddingCache());

    const first = await embeddings.embed(['repeated', 'repeated']);
    const second = await embeddings.embed(['repeated']);

    expect(first?.misses).toBe(1);
    expect(second?.misses).toBe(0);
    expect(client.calls).toEqual([['repeated']]);
  });
});
