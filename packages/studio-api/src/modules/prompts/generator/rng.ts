/**
 * Deterministic randomness for the prompt generator.
 *
 * The whole generator is a pure function of (experience, difficulty, seed), so
 * the only randomness allowed is a seeded PRNG — never `Math.random`, never
 * `Date.now`. `fnv1a` turns a stable string into a seed; `mulberry32` expands
 * that seed into a stream; `pick`/`pickN` are the only two ways the stream is
 * consumed, so every template draws in a fixed, auditable order.
 */

/** 32-bit FNV-1a hash of a string. Stable across runs and platforms. */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG: tiny, fast, and good enough for picking prose variants. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One seeded draw from a non-empty list. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * `count` distinct seeded draws, order-significant. A partial Fisher–Yates
 * shuffle: only the first `count` slots are settled, and the source array is
 * copied first so banks stay immutable.
 */
export function pickN<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
