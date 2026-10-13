import { createHash } from 'node:crypto';

import type {
  OpportunityQuery,
  SourceCallQueries,
  SourceOperation,
  SpendingLens,
} from '@sysdesign/contracts';

/**
 * The query's arithmetic: canonical spelling, the ledger's key, the next
 * page. The shapes themselves are wire types in contracts and are re-exported
 * here for the core's own imports.
 */
export type { OpportunityQuery } from '@sysdesign/contracts';

/** The same query however it was assembled: keys sorted, absent filters dropped. */
export function canonicalQuery<T extends object>(query: T): T {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries) as T;
}

/**
 * sha256 hex over the source, the operation and the canonical query — the
 * ledger's lookup key. The operation is part of the hash, so a description
 * call can never read as a fresh search for the same notice.
 */
export function callKey<K extends SourceOperation>(
  source: string,
  operation: K,
  query: SourceCallQueries[K],
): string {
  return digest(source, operation, query);
}

/** sha256 hex over the lens and the canonical query — the snapshot table's key. */
export const snapshotKey = (lens: SpendingLens, query: object): string =>
  digest('snapshot', lens, query);

const digest = (...parts: [string, string, object]): string =>
  createHash('sha256')
    .update(`${parts[0]}\n${parts[1]}\n${JSON.stringify(canonicalQuery(parts[2]))}`)
    .digest('hex');

/** The following page of the same search. */
export const nextPage = (query: OpportunityQuery): OpportunityQuery => ({
  ...query,
  offset: query.offset + query.limit,
});
