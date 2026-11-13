/**
 * A probe's declared filter as one SQL `where` clause over the payload: what
 * it narrows to, and what every search leaves out. Compiled two-valued on
 * purpose — in SQL a comparison against a key the payload does not carry is
 * NULL, and `NOT NULL` drops the row, where the store's rule reads a missing
 * key as matching nothing: a lesson stored before scopes has no `scope`, and
 * every search must still read it.
 */
import type { MemoryScope } from '@sysdesign/contracts';
import { textArrayLiteral } from '@sysdesign/pgvector-kit';

import type { ProbeFilter } from '../../../orchestrators/memory/ports';

/** A `where` clause (`true` when nothing narrows) and the values its `?` placeholders bind, in order. */
export interface CompiledFilter {
  where: string;
  params: unknown[];
}

/**
 * The clauses a filter compiles to, each with its bound values: `kinds` and
 * `pipelines` narrow to a list, `notRunIds` leaves runs out, and the bound
 * scopes leave out every memory bound to a unit of work — every such memory
 * when the search names no unit, and every one recorded for another unit, or
 * for none, when it names `unitKey`. A memory of any other scope, or of none,
 * matches no clause here and is always read; `coalesce(…, false)` is what
 * makes a missing scope read that way. Inside the filter, so a slot an
 * excluded memory would have taken is refilled from below. An empty list, and
 * no bound scope, add no clause: there is nothing to narrow by or leave out.
 */
export function compileProbeFilter(
  filter: ProbeFilter | undefined,
  boundScopes: readonly MemoryScope[],
): CompiledFilter {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const narrow = (field: 'kind' | 'pipeline', values: readonly string[] | undefined): void => {
    if (values === undefined || values.length === 0) return;
    clauses.push(`payload->>'${field}' = ANY(?::text[])`);
    params.push(textArrayLiteral(values));
  };
  narrow('kind', filter?.kinds);
  narrow('pipeline', filter?.pipelines);
  if (filter?.notRunIds !== undefined && filter.notRunIds.length > 0) {
    clauses.push(`NOT (payload->>'runId' = ANY(?::text[]))`);
    params.push(textArrayLiteral(filter.notRunIds));
  }
  if (boundScopes.length > 0) {
    const bound = `coalesce(payload->>'scope' = ANY(?::text[]), false)`;
    params.push(textArrayLiteral(boundScopes));
    if (filter?.unitKey === undefined) {
      clauses.push(`NOT ${bound}`);
    } else {
      clauses.push(`NOT (${bound} AND (payload->>'unitKey') IS DISTINCT FROM ?)`);
      params.push(filter.unitKey);
    }
  }
  return { where: clauses.length === 0 ? 'true' : clauses.join(' AND '), params };
}
