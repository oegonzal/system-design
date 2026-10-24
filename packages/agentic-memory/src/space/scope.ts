/**
 * Scope: which memories a request may see. Every scope names the partition —
 * the policy's first scope key — and only declared keys. A memory is VISIBLE to
 * a request whose scope contains the memory's own: a tenant-wide fact reaches
 * every user in the tenant, a user's fact that user alone, a sibling's no one
 * else. A consolidation reads WITHIN a scope: every memory at or below it.
 */
import type { RecordScope } from '@sysdesign/contracts';

export type ScopeCheck = { ok: true; partition: string } | { ok: false; message: string };

/** A scope names the partition and declares nothing the policy does not. */
export function checkScope(scope: RecordScope, scopeKeys: readonly string[]): ScopeCheck {
  const partitionKey = scopeKeys[0];
  const partition = partitionKey === undefined ? undefined : scope[partitionKey];
  if (partitionKey === undefined || partition === undefined) {
    return { ok: false, message: `the scope must name ${partitionKey ?? 'a partition'}` };
  }
  const undeclared = Object.keys(scope).filter((key) => !scopeKeys.includes(key));
  if (undeclared.length > 0) {
    return { ok: false, message: `the scope names undeclared keys: ${undeclared.join(', ')}` };
  }
  return { ok: true, partition };
}

/** Every entry of `inner` holds in `outer`. */
const containedIn = (inner: RecordScope, outer: RecordScope): boolean =>
  Object.entries(inner).every(([key, value]) => outer[key] === value);

/** A record is visible to a request whose scope contains the record's. */
export const visibleTo = (record: RecordScope, request: RecordScope): boolean =>
  containedIn(record, request);

/** One spelling per scope, its keys sorted: what an identity, a group and a hash compare. */
export const canonicalScope = (scope: RecordScope): string =>
  JSON.stringify(
    Object.keys(scope)
      .sort()
      .map((key) => [key, scope[key]]),
  );
