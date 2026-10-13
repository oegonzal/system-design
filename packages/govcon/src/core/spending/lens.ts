import type { Provenance, ServedFrom, SpendingLens } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import type { BudgetExhausted, SourceFailure } from '../budget';
import type { SnapshotRow, SpendingSnapshotStore } from '../ports';
import { snapshotKey } from '../query';
import { messageOf } from '../text';

/** A lens's answer minus the provenance the cache adds. */
export type LensBody<P extends { provenance: Provenance }> = Omit<P, 'provenance'>;

/** Something the query named that the source does not have — an agency code, say. */
export interface Missing {
  kind: 'missing';
  what: string;
  id: string;
}

export type LensRefusal = Missing | BudgetExhausted | SourceFailure;

/**
 * What a lens's load answers: the body, what the source said about its
 * freshness and what it cost — or why not. `keep: false` marks an answer the
 * source cut short: served, never stored, so the next read tries again.
 */
export type LensLoad<B> =
  { kind: 'ok'; body: B; asOf: string | null; requests: number; keep?: boolean } | LensRefusal;

/**
 * One lens: its name in the snapshot table, what a stored body must still be
 * before it is trusted, the provider facts it carries, and how it loads.
 * Every lens is this one shape, so the cache below serves them all.
 */
export interface LensSpec<Q extends object, B> {
  lens: SpendingLens;
  /** The upstream's id — the provenance's `source`. */
  source: string;
  schema: ZodType<B>;
  disclosures: readonly string[];
  load(query: Q): Promise<LensLoad<B>>;
}

export type LensAnswer<B> = { kind: 'ok'; body: B; provenance: Provenance } | LensRefusal;

/**
 * How a read may depart from the default: `refresh` asks the source inside
 * the cache window and replaces the row — the way a warm renews a day's
 * snapshots — while a load the source refuses still serves the stored row as
 * stale.
 */
export interface ReadOptions {
  refresh?: boolean;
}

interface Stored<B> {
  row: SnapshotRow;
  body: B;
}

/**
 * The one read-through every lens goes through. A stored body inside the
 * cache window answers as `snapshot` without a request; otherwise the lens
 * loads from the source, the body is stored, and it answers as `source`. A refresh that the
 * source refused — a rate limit, a failure, a spent budget — serves the
 * stored body of any age as `stale`, saying so, because an answer the owner
 * already had is better than none; something `missing` is never served
 * stale, since the snapshot cannot vouch for a thing the source does not
 * have. An answer a lens marks `keep: false` — one the source cut short — is
 * served as `source` and not stored, so the next read asks again. A read
 * asked to `refresh` skips the window and asks the source. One query is
 * never loaded twice at once: a reader that arrives while its load is in
 * flight waits on that load. Freshness is decided here and nowhere else,
 * from the injected clock.
 *
 * The store is an optimisation, never a dependency: a read that fails falls
 * through to the load with a warning, a write that fails loses one snapshot
 * with a warning, and a stored payload the lens's schema refuses is treated
 * as absent — refused, never trusted.
 */
export class SnapshotCache {
  /** Loads in flight, by snapshot key. */
  private readonly loading = new Map<string, Promise<LensAnswer<unknown>>>();

  constructor(
    private readonly store: SpendingSnapshotStore,
    private readonly ttlMs: number,
    private readonly now: () => Date,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async read<Q extends object, B>(
    spec: LensSpec<Q, B>,
    query: Q,
    options: ReadOptions = {},
  ): Promise<LensAnswer<B>> {
    const key = snapshotKey(spec.lens, query);
    const at = this.now();
    const stored = await this.stored(spec, key);
    if (stored !== null && options.refresh !== true && this.fresh(stored.row, at)) {
      return answer(spec, stored, 'snapshot');
    }
    const inFlight = this.loading.get(key);
    if (inFlight !== undefined) return inFlight as Promise<LensAnswer<B>>;
    const load = this.loadThrough(spec, query, { key, at, stored });
    this.loading.set(key, load);
    try {
      return await load;
    } finally {
      this.loading.delete(key);
    }
  }

  /** The source's answer stored and served — or, refused, the stored one as stale. */
  private async loadThrough<Q extends object, B>(
    spec: LensSpec<Q, B>,
    query: Q,
    { key, at, stored }: { key: string; at: Date; stored: Stored<B> | null },
  ): Promise<LensAnswer<B>> {
    const fetched = await spec.load(query);
    if (fetched.kind === 'ok') {
      const row: SnapshotRow = {
        lens: spec.lens,
        queryKey: key,
        query,
        fetchedAt: at,
        asOf: fetched.asOf,
        requests: fetched.requests,
        payload: fetched.body,
      };
      if (fetched.keep !== false) await this.put(row);
      return answer(spec, { row, body: fetched.body }, 'source');
    }
    if (stored !== null && fetched.kind !== 'missing') {
      this.warn(
        `${spec.lens}: refresh failed (${reasonOf(fetched)}); serving the snapshot of ${stored.row.fetchedAt.toISOString()}`,
      );
      return answer(spec, stored, 'stale');
    }
    return fetched;
  }

  private fresh(row: SnapshotRow, at: Date): boolean {
    return this.ttlMs > 0 && at.getTime() - row.fetchedAt.getTime() < this.ttlMs;
  }

  /** The stored row with its body parsed, or null: absent, unreadable, or a payload the schema refuses. */
  private async stored<Q extends object, B>(
    spec: LensSpec<Q, B>,
    key: string,
  ): Promise<Stored<B> | null> {
    let row: SnapshotRow | null;
    try {
      row = await this.store.find(spec.lens, key);
    } catch (error) {
      this.warn(`${spec.lens}: snapshot not read: ${messageOf(error)}`);
      return null;
    }
    if (row === null) return null;
    const parsed = spec.schema.safeParse(row.payload);
    if (!parsed.success) {
      this.warn(
        `${spec.lens}: stored payload refused: ${parsed.error.issues[0]?.message ?? 'unreadable'}`,
      );
      return null;
    }
    return { row, body: parsed.data };
  }

  private async put(row: SnapshotRow): Promise<void> {
    try {
      await this.store.put(row);
    } catch (error) {
      this.warn(`${row.lens}: snapshot not written: ${messageOf(error)}`);
    }
  }
}

const answer = <Q extends object, B>(
  spec: LensSpec<Q, B>,
  stored: Stored<B>,
  servedFrom: ServedFrom,
): LensAnswer<B> => ({
  kind: 'ok',
  body: stored.body,
  provenance: {
    source: spec.source,
    fetchedAt: stored.row.fetchedAt.toISOString(),
    asOf: stored.row.asOf,
    servedFrom,
    requests: stored.row.requests,
    disclosures: [...spec.disclosures],
  },
});

const reasonOf = (refusal: BudgetExhausted | SourceFailure): string =>
  refusal.kind === 'budget-exhausted'
    ? `budget ${refusal.spent}/${refusal.budget} spent`
    : `${refusal.outcome}: ${refusal.message}`;
