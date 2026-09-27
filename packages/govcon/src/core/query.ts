import { createHash } from 'node:crypto';

import type { OpportunityQuery } from '@sysdesign/contracts';

/**
 * The query's arithmetic: canonical spelling, the call log's key, the next
 * page. The shape itself (`OpportunityQuery`, `QueryFilter`) is a wire type in
 * contracts and is re-exported here for the core's own imports.
 */
export type { OpportunityQuery, QueryFilter } from '@sysdesign/contracts';

/** The same query however it was assembled: keys sorted, absent filters dropped. */
export function canonicalQuery(query: OpportunityQuery): OpportunityQuery {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries) as unknown as OpportunityQuery;
}

/** sha256 hex over the source id and the canonical query — the call log's lookup key. */
export function queryKey(source: string, query: OpportunityQuery): string {
  return createHash('sha256')
    .update(`${source}\n${JSON.stringify(canonicalQuery(query))}`)
    .digest('hex');
}

/** The ledger key of a description call — its own namespace, so it can never read as a fresh search. */
export function descriptionKey(source: string, noticeId: string): string {
  return createHash('sha256').update(`${source}\ndescription\n${noticeId}`).digest('hex');
}

/** The following page of the same search. */
export const nextPage = (query: OpportunityQuery): OpportunityQuery => ({
  ...query,
  offset: query.offset + query.limit,
});
