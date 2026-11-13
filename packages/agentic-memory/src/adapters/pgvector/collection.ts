/**
 * How records live in pgvector: one table per index generation, embedding
 * model and width, its columns the point payload's fields typed as the filter
 * reads them; the statements that make the table and its indexes on first
 * use; and the visibility filter itself — the rule `pointVisible` states for
 * the in-memory index, and `scope <@ request` states for the record store —
 * compiled to a `where` clause and the values bound to its placeholders.
 */
import { createHash } from 'node:crypto';

import { collectionName as pgvectorCollection, textArrayLiteral } from '@sysdesign/pgvector-kit';

import type { VisibilityFilter } from '../../ports';

/**
 * What is embedded is part of the vector space, as the model and the width
 * are: cosines across two representations are not comparable. Bump this
 * whenever the text a record embeds changes; the sweep fills the new
 * collection, since every current record is then due for it.
 *
 * `v2` since 2026-11-12, when the index moved from Qdrant to a table in the
 * record store's own database. The text a record embeds did not change, but
 * the `v1` points never crossed over, and a record whose `projected_into`
 * still named the `v1` collection would have looked projected into a table
 * holding nothing — never re-projected, never found by meaning. The bump
 * makes every current record due again, so the first sweep rebuilds the
 * index from Postgres: one embedding call per page of 100 records, about 13
 * calls for the 1,250 records the laptop held projected on 2026-11-11; the
 * closed records still marked `v1` have no point to remove, so the sweep
 * forgets their mark without asking the index.
 */
const INDEX_GENERATION = 'v2';

/** Bound to the generation, the model and the width, so vectors of two spaces never share a ranking. */
export const collectionName = (model: string, dimensions: number): string =>
  pgvectorCollection('agentic-memory', INDEX_GENERATION, model, dimensions);

/** PostgreSQL cuts an identifier past this many bytes without a word. */
const IDENTIFIER_BYTES = 63;
const DIGEST_CHARACTERS = 12;

/**
 * An index named for its table and what it covers. Past the identifier limit
 * the database would cut the name silently, and `if not exists` would then
 * read one index's cut name as another's and skip making it — so a long name
 * keeps what fits of the table's, the suffix whole, and 12 hex characters of
 * the full name's sha256 between them: distinct per table and per suffix,
 * the same every time.
 */
const indexName = (table: string, suffix: string): string => {
  const full = `${table}_${suffix}`;
  // The table name is `[a-z0-9_]` and the suffix is, so the length is the byte count.
  if (full.length <= IDENTIFIER_BYTES) return full;
  const digest = createHash('sha256')
    .update(full, 'utf8')
    .digest('hex')
    .slice(0, DIGEST_CHARACTERS);
  const kept = IDENTIFIER_BYTES - suffix.length - digest.length - 2;
  return `${table.slice(0, kept)}_${digest}_${suffix}`;
};

/** The btree indexes, one per clause every search carries beyond the scope: the space with its partition, the register, the two times. */
const BTREE_INDEXES: readonly { suffix: string; columns: string }[] = [
  { suffix: 'space_partition_idx', columns: 'space_id, partition' },
  { suffix: 'register_idx', columns: 'register' },
  { suffix: 'valid_from_idx', columns: 'valid_from' },
  { suffix: 'expires_at_idx', columns: 'expires_at' },
];

/**
 * The statements that make a collection's table and its indexes, each `if
 * not exists` so a second boot runs them as a no-op. The columns are the
 * point payload's fields, typed as the filter reads them: the three it
 * matches exactly as text, the scope and the metadata as jsonb read by key,
 * the two times as timestamps, and the vector at the embedder's width. The
 * HNSW index over the vector serves the nearest-first order by cosine
 * distance. The width is spelled into the column's type, so it is checked
 * here rather than refused by the database as a syntax error naming nothing.
 */
export function schemaFor(table: string, dimensions: number): string[] {
  if (!Number.isSafeInteger(dimensions) || dimensions < 1) {
    throw new Error(`a vector column takes a positive whole width, got ${String(dimensions)}`);
  }
  return [
    `create table if not exists "${table}" (` +
      'id uuid primary key, space_id text not null, register text not null, ' +
      'partition text not null, scope jsonb not null, metadata jsonb not null, ' +
      'valid_from timestamptz not null, expires_at timestamptz null, ' +
      `embedding vector(${dimensions}) not null)`,
    ...BTREE_INDEXES.map(
      ({ suffix, columns }) =>
        `create index if not exists "${indexName(table, suffix)}" on "${table}" (${columns})`,
    ),
    `create index if not exists "${indexName(table, 'embedding_hnsw')}" on "${table}" ` +
      'using hnsw (embedding vector_cosine_ops)',
  ];
}

/** A `where` clause with a `?` per bound value, and those values in order. */
export interface CompiledFilter {
  where: string;
  params: unknown[];
}

/** The scope keys a filter reads from a point's `scope`: every policy key but the first, which travels as `partition`. */
const narrowingKeys = (scopeKeys: readonly string[]): readonly string[] => scopeKeys.slice(1);

/** A key the point's scope does not carry: `->>` reads a missing key as SQL null, as Qdrant's `is_empty` read it. */
const UNSET = '(scope->>?) is null';

/**
 * The visibility a search applies, as SQL: in the space, one of the registers
 * and the partition; then, beyond the partition, each policy scope key unset
 * on the point or — when the request names the key — equal to the request's,
 * read over the policy's keys the filter carries, never the request's, so a
 * key the request leaves out still keeps a narrower memory out (a tenant-wide
 * memory reaches every user in the tenant, a user's memory no tenant-wide
 * request); unexpired at `now`; valid from within the time range; and carrying
 * every metadata value asked for. Key names are bound as values, never spelled
 * into the clause, and every clause is two-valued: a row is kept or dropped,
 * never lost to a null.
 */
export function compileVisibilityFilter(filter: VisibilityFilter): CompiledFilter {
  const clauses = ['space_id = ?', 'register = any(?::text[])', 'partition = ?'];
  const params: unknown[] = [filter.spaceId, textArrayLiteral(filter.registers), filter.partition];
  for (const key of narrowingKeys(filter.scopeKeys)) {
    if (key in filter.scope) {
      clauses.push(`(${UNSET} or scope->>? = ?)`);
      params.push(key, key, filter.scope[key]);
    } else {
      clauses.push(UNSET);
      params.push(key);
    }
  }
  clauses.push('(expires_at is null or expires_at > ?::timestamptz)');
  params.push(filter.now.toISOString());
  if (filter.since !== undefined) {
    clauses.push('valid_from >= ?::timestamptz');
    params.push(filter.since.toISOString());
  }
  if (filter.until !== undefined) {
    clauses.push('valid_from < ?::timestamptz');
    params.push(filter.until.toISOString());
  }
  for (const [field, value] of Object.entries(filter.where ?? {})) {
    clauses.push('metadata->>? = ?');
    params.push(field, value);
  }
  return { where: clauses.join(' and '), params };
}
