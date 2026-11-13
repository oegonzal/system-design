/**
 * The vector index in pgvector, a rebuildable projection of the current
 * records Postgres keeps, as a table in that same database. The table is
 * bound to the embedder's model and width; it and its indexes are ensured
 * once, on first use. A row is a record's id, the payload the engine built —
 * never the text — as typed columns, and one cosine-indexed vector; every
 * statement is committed when its call returns, so a row is searchable at
 * once. Without a model there is no table: a write does nothing and a search
 * finds nothing.
 */
import {
  ensureVectorSchema,
  tableName,
  textArrayLiteral,
  vectorLiteral,
  type SqlExecutor,
} from '@sysdesign/pgvector-kit';

import { byText } from '../../order';
import type { PointPayload, VectorIndex, VisibilityFilter } from '../../ports';
import { collectionName, compileVisibilityFilter, schemaFor } from './collection';

type Point = { id: string; vector: readonly number[]; payload: PointPayload };

/** Rows per insert statement: the sweep's page, so a page lands in one statement. */
const UPSERT_BATCH = 100;

/**
 * How many candidates the HNSW scan keeps before the filter: pgvector's
 * default, raised to the search's limit when that is larger so a filtered
 * search can still fill it. The scan goes on past the candidates (iterative,
 * in relaxed order) until the limit is met, and pgvector takes no setting
 * above 1000.
 */
const EF_SEARCH_FLOOR = 40;
const EF_SEARCH_CEILING = 1000;

const COLUMNS =
  'id, space_id, register, partition, scope, metadata, valid_from, expires_at, embedding';
const ROW = '(?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::timestamptz, ?::timestamptz, ?::vector)';
/** Every column but the key follows the newer point, as an upsert's should. */
const ON_CONFLICT =
  'on conflict (id) do update set space_id = excluded.space_id, register = excluded.register, ' +
  'partition = excluded.partition, scope = excluded.scope, metadata = excluded.metadata, ' +
  'valid_from = excluded.valid_from, expires_at = excluded.expires_at, embedding = excluded.embedding';

/** A point's values in column order, each bound as its placeholder's cast reads it. */
const rowValues = (point: Point): unknown[] => [
  point.id,
  point.payload.spaceId,
  point.payload.register,
  point.payload.partition,
  JSON.stringify(point.payload.scope),
  JSON.stringify(point.payload.metadata),
  point.payload.validFrom,
  point.payload.expiresAt,
  vectorLiteral(point.vector),
];

const batches = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export class PgvectorVectorIndex implements VectorIndex {
  readonly collection: string | null;
  private ensuring: Promise<void> | null = null;

  constructor(
    private readonly sql: SqlExecutor,
    private readonly embedder: { model: string | null; dimensions: number },
  ) {
    this.collection =
      embedder.model === null ? null : collectionName(embedder.model, embedder.dimensions);
  }

  async upsert(points: readonly Point[]): Promise<void> {
    const { collection } = this;
    if (collection === null || points.length === 0) return;
    const table = await this.ensure(collection);
    // One row per id, the last point winning: a statement that meets the same
    // id twice is refused by the database rather than resolved.
    const latest = [...new Map(points.map((point) => [point.id, point])).values()];
    for (const batch of batches(latest, UPSERT_BATCH)) {
      await this.sql.run(
        `insert into "${table}" (${COLUMNS}) values ${batch.map(() => ROW).join(', ')} ${ON_CONFLICT}`,
        batch.flatMap(rowValues),
      );
    }
  }

  async remove(ids: readonly string[]): Promise<void> {
    const { collection } = this;
    if (collection === null || ids.length === 0) return;
    const table = await this.ensure(collection);
    await this.sql.run(`delete from "${table}" where id = any(?::uuid[])`, [textArrayLiteral(ids)]);
  }

  /**
   * Ids and scores only: Postgres validates every hit, so the payload never
   * needs to come back. The score is `1 - (embedding <=> query)`, the cosine
   * similarity, highest first — sorted here, since a relaxed-order iterative
   * scan may hand rows back slightly out of distance order, with ties broken
   * by id as the in-memory index breaks them. One transaction, so the two scan
   * settings hold for the select alone.
   */
  async search(query: {
    vector: readonly number[];
    limit: number;
    filter: VisibilityFilter;
  }): Promise<{ id: string; score: number }[]> {
    const { collection } = this;
    if (collection === null) return [];
    const table = await this.ensure(collection);
    const { where, params } = compileVisibilityFilter(query.filter);
    const vector = vectorLiteral(query.vector);
    const candidates = Math.min(
      EF_SEARCH_CEILING,
      Math.max(EF_SEARCH_FLOOR, Math.trunc(query.limit)),
    );
    return this.sql.transaction(async (tx) => {
      await tx.run('set local hnsw.iterative_scan = relaxed_order');
      await tx.run(`set local hnsw.ef_search = ${candidates}`);
      const rows = await tx.all<{ id: string; score: number | string }>(
        `select id, 1 - (embedding <=> ?::vector) as score from "${table}" where ${where} ` +
          'order by embedding <=> ?::vector limit ?',
        [vector, ...params, vector, query.limit],
      );
      return rows
        .map((row) => ({ id: row.id, score: Number(row.score) }))
        .sort((a, b) => b.score - a.score || byText(a.id, b.id));
    });
  }

  /**
   * Once per process; a failed attempt is forgotten, so the next operation
   * tries again. A refused index — a `create index` the database will not run,
   * for want of memory or of a permission — fails the ensure on purpose: there
   * is no "index refused, carry on" path on pgvector, where the schema is
   * either whole or not made sure of, so every upsert and search answers
   * `index_failed` through the sweep's report until it is, and the refused
   * statement's error is what the warning names.
   */
  private ensure(collection: string): Promise<string> {
    const table = tableName(collection);
    this.ensuring ??= ensureVectorSchema(
      this.sql,
      schemaFor(table, this.embedder.dimensions),
    ).catch((error: unknown) => {
      this.ensuring = null;
      throw error;
    });
    return this.ensuring.then(() => table);
  }
}
