/**
 * The simple fakes a spec reaches for — a clock moved by hand, counted ids, a
 * table-driven embedder and a space store in memory — shared by this package's
 * specs and a host's.
 */
import { createHash } from 'node:crypto';

import type { Clock, Embedder, Ids, SpaceStore, StoredSpace } from '../ports';

export interface ManualClock extends Clock {
  advance(ms: number): void;
  set(at: Date): void;
}

/** A clock a spec moves by hand. */
export function manualClock(start: Date): ManualClock {
  let now = new Date(start);
  const clock = (() => new Date(now)) as ManualClock;
  clock.advance = (ms) => {
    now = new Date(now.getTime() + ms);
  };
  clock.set = (at) => {
    now = new Date(at);
  };
  return clock;
}

/** Ids in counted order, shaped as uuids so a uuid column takes them. */
export function sequentialIds(): Ids {
  let next = 0;
  return () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
}

/** A unit vector a text always maps to, for a text a spec did not place by hand. */
function hashedVector(text: string, dimensions: number): number[] {
  const digest = createHash('sha256').update(text).digest();
  const raw = Array.from(
    { length: dimensions },
    (_, index) => (digest[index % digest.length] ?? 0) - 127.5,
  );
  const norm = Math.hypot(...raw) || 1;
  return raw.map((value) => value / norm);
}

/** An embedder whose vectors a spec places by hand; any other text maps to a fixed unit vector of its own. */
export function tableEmbedder(options: {
  model: string;
  dimensions: number;
  table?: Readonly<Record<string, readonly number[]>>;
}): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: options.model,
    dimensions: options.dimensions,
    calls,
    embed(inputs) {
      calls.push([...inputs]);
      return Promise.resolve(
        inputs.map((text) => [
          ...(options.table?.[text] ?? hashedVector(text, options.dimensions)),
        ]),
      );
    },
  };
}

/** An embedder with no model, as a host without an embeddings key runs. */
export const disabledEmbedder = (): Embedder => ({
  model: null,
  dimensions: 0,
  embed: () => Promise.resolve(null),
});

/** An embedder whose every call fails, as a provider outage looks. */
export const failingEmbedder = (model: string, dimensions: number): Embedder => ({
  model,
  dimensions,
  embed: () => Promise.resolve(null),
});

export class InMemorySpaceStore implements SpaceStore {
  private readonly rows = new Map<string, StoredSpace>();

  insert(space: StoredSpace): Promise<'inserted' | 'name_taken'> {
    if (space.name !== null && this.named(space.name) !== undefined) {
      return Promise.resolve('name_taken');
    }
    this.rows.set(space.id, structuredClone(space));
    return Promise.resolve('inserted');
  }

  get(id: string): Promise<StoredSpace | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : structuredClone(row));
  }

  findByName(name: string): Promise<StoredSpace | null> {
    const row = this.named(name);
    return Promise.resolve(row === undefined ? null : structuredClone(row));
  }

  private named(name: string): StoredSpace | undefined {
    return [...this.rows.values()].find((row) => row.name === name);
  }
}
