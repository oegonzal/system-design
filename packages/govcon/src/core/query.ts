import { createHash } from 'node:crypto';

import type { OpportunityQuery, SourceCallQueries, SourceOperation } from '@sysdesign/contracts';

/**
 * The query's arithmetic: canonical spelling, the ledger's key, the next
 * page. The shapes themselves are wire types in contracts and are re-exported
 * here for the core's own imports.
 */
export type { OpportunityQuery, QueryFilter } from '@sysdesign/contracts';

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
  return createHash('sha256')
    .update(`${source}\n${operation}\n${JSON.stringify(canonicalQuery(query))}`)
    .digest('hex');
}

/** The key of a search page. */
export const queryKey = (source: string, query: OpportunityQuery): string =>
  callKey(source, 'search', query);

/** The key of a description call — its own namespace. */
export const descriptionKey = (source: string, noticeId: string): string =>
  callKey(source, 'description', { noticeId });

/** The following page of the same search. */
export const nextPage = (query: OpportunityQuery): OpportunityQuery => ({
  ...query,
  offset: query.offset + query.limit,
});
