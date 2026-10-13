import { createHash } from 'node:crypto';

import type {
  OpportunityQuery,
  SourceCallQueries,
  SourceOperation,
  SpendingLens,
  SpendingScope,
} from '@sysdesign/contracts';

/**
 * The query's arithmetic: canonical spelling, the ledger's key, the next
 * page. The shapes themselves are wire types in contracts and are re-exported
 * here for the core's own imports.
 */
export type { OpportunityQuery } from '@sysdesign/contracts';

/** One spelling of a value: an object's keys sorted and its absent ones dropped, at every depth; a list keeps its order, which may mean something. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, canonical(item)]),
  );
};

/** The same query however it was assembled: keys sorted, absent filters dropped — in the query and in every object it holds. */
export const canonicalQuery = <T extends object>(query: T): T => canonical(query) as T;

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

/** sha256 hex over a spending scope — what an alert's key names, so the same finding in another scope is another alert. */
export const scopeKey = (scope: SpendingScope): string => digest('scope', 'spending', scope);

const digest = (...parts: [string, string, object]): string =>
  createHash('sha256')
    .update(`${parts[0]}\n${parts[1]}\n${JSON.stringify(canonicalQuery(parts[2]))}`)
    .digest('hex');

/** The following page of the same search. */
export const nextPage = (query: OpportunityQuery): OpportunityQuery => ({
  ...query,
  offset: query.offset + query.limit,
});
