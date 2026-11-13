/**
 * The vector store adapter, over pgvector in the stack's own database. The
 * collection's table and indexes are made sure of on first use, and every
 * write is a committed statement, so a memory a run just stored is searchable
 * by the next one. `verify` never throws: the store's state is reported as
 * data. Every statement binds its values through the executor's `?`
 * placeholders; the only text interpolated is the table name the kit derived,
 * the vector column names from `VECTOR_NAMES`, and whole numbers checked here.
 */
import { UNIT_BOUND_SCOPES, type MemoryStoreAvailabilityDto } from '@sysdesign/contracts';
import {
  ensureVectorSchema,
  tableName,
  textArrayLiteral,
  vectorLiteral,
  type SqlExecutor,
} from '@sysdesign/pgvector-kit';
import { describeError } from '@sysdesign/run-dump';

import {
  VECTOR_NAMES,
  type ChunkKindScope,
  type MemoryHit,
  type MemoryProbe,
  type MemoryStore,
  type PointRef,
  type PointRetraction,
  type StoredChunk,
  type VectorName,
} from '../../../orchestrators/memory/ports';
import {
  collectionName,
  fromPayload,
  payloadSchema,
  pointId,
  schemaFor,
  toPayload,
} from './collection';
import { compileProbeFilter } from './filter';

/** Over-fetch before deduping identical lessons from repeated runs of one prompt. */
const DEDUPE_FACTOR = 3;

/**
 * pgvector's HNSW scan reads `ef_search` candidates before the filter is
 * applied, 40 by default: a probe fetching more than that from a filtered
 * table would come back short. The search sets it to the largest fetch of
 * the batch, never below the default, and never above the 1000 the server
 * accepts; with `iterative_scan` on, a filter that still leaves a probe short
 * is refilled by reading further into the index.
 */
const EF_SEARCH_FLOOR = 40;
const EF_SEARCH_CEILING = 1000;

/** Rows per upsert statement: four values each, well inside the server's parameter and statement bounds. */
const UPSERT_BATCH = 100;

/** A row as the search statement selects it: which probe it answers, and the memory with its score. */
interface SearchRow {
  probe: number;
  id: string;
  payload: unknown;
  score: number;
}

/** A row ready to upsert: its id, the payload as stored, and one vector per name. */
interface Row {
  id: string;
  payload: unknown;
  vectors: Readonly<Record<VectorName, readonly number[]>>;
}

/**
 * A point as the Qdrant scroll handed it over: the id, the payload and the
 * vectors by name — any names, since the scroll's shape is not this module's.
 */
export interface ImportedPoint {
  id: string;
  payload: unknown;
  vectors: Readonly<Partial<Record<string, readonly number[]>>>;
}

/** What an import did: how many rows it wrote (or would have), and each point it refused, by id and reason. */
export interface ImportOutcome {
  imported: number;
  refused: { id: string; reason: string }[];
}

const quoted = (identifier: string): string => `"${identifier}"`;

/** A whole positive number for the statement text, refused by name otherwise: nothing unread is interpolated. */
const wholeCount = (value: number, what: string): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${what} must be a positive whole number, not ${String(value)}`);
  }
  return value;
};

/**
 * The vector column a probe searches, from the declared names and never from
 * the probe's own text: `using` is typed to the names, and this is the one
 * place the type meets the statement.
 */
const vectorColumn = (using: VectorName): string => {
  const name = VECTOR_NAMES.find((candidate) => candidate === using);
  if (name === undefined) throw new Error(`no vector named ${String(using)}`);
  return quoted(name);
};

/** The columns every upsert writes, and the row of placeholders that fills them. */
const UPSERT_COLUMNS = ['id', 'payload', ...VECTOR_NAMES].map(quoted).join(', ');
const UPSERT_ROW = `(?, ?::jsonb, ${VECTOR_NAMES.map(() => '?::vector').join(', ')})`;
const UPSERT_UPDATE = ['payload', ...VECTOR_NAMES]
  .map((column) => `${quoted(column)} = excluded.${quoted(column)}`)
  .join(', ');

export class PgvectorMemoryStore implements MemoryStore {
  private readonly collection: string | null;
  private readonly table: string | null;
  /** The one ensure of this process, kept while it runs and once it has; null until the first call, and again after a failure. */
  private ensuring: Promise<void> | null = null;

  constructor(
    private readonly sql: SqlExecutor,
    private readonly model: string | null,
    private readonly dimensions: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.collection = model === null ? null : collectionName(model, dimensions);
    this.table = this.collection === null ? null : tableName(this.collection);
  }

  async verify(): Promise<MemoryStoreAvailabilityDto> {
    const { model, collection, table } = this;
    if (collection === null || table === null) {
      return { ready: false, reason: 'no-model', note: null, model, collection, chunks: 0 };
    }
    try {
      await this.ensure(table);
      const row = await this.sql.one<{ chunks: number }>(
        `select count(*)::int as chunks from ${quoted(table)}`,
      );
      return { ready: true, reason: null, note: null, model, collection, chunks: row?.chunks ?? 0 };
    } catch (error) {
      // A count that failed after the schema was made sure of forgets the
      // ensure too: the table may be gone, so the next call looks at it again.
      this.ensuring = null;
      return {
        ready: false,
        reason: 'unreachable',
        note: describeError(error).message,
        model,
        collection,
        chunks: 0,
      };
    }
  }

  /**
   * How many chunks the table holds, read without making sure of it: the
   * import's dry run asks this, and must make nothing — not the table, not an
   * index. A table not there yet is `absent`, told apart from one holding
   * nothing, since the service makes it at boot and a dry run must not.
   */
  async held(): Promise<{ table: 'absent' } | { table: 'present'; chunks: number }> {
    const { table } = this;
    if (table === null) throw new Error('memory store: no embedding model to bind to');
    const found = await this.sql.one<{ present: boolean }>(
      'select to_regclass(?) is not null as present',
      [quoted(table)],
    );
    if (found?.present !== true) return { table: 'absent' };
    const row = await this.sql.one<{ chunks: number }>(
      `select count(*)::int as chunks from ${quoted(table)}`,
    );
    return { table: 'present', chunks: row?.chunks ?? 0 };
  }

  /**
   * Every probe in one statement — one parenthesised select per probe, joined
   * by `union all` and told apart by its ordinal — inside one transaction that
   * first widens the HNSW scan to the batch's largest fetch. A branch orders
   * by the distance operator the index is built on, so the index serves it;
   * the rows are re-sorted here because a relaxed-order scan may hand them
   * back slightly out of order, then deduped by content hash and cut at the
   * probe's limit, with any payload this build cannot read passed by.
   */
  async searchMany(probes: readonly MemoryProbe[]): Promise<MemoryHit[][]> {
    if (probes.length === 0) return [];
    const table = await this.bound();
    const fetches = probes.map((probe) => wholeCount(probe.limit, 'a probe limit') * DEDUPE_FACTOR);
    const efSearch = Math.min(EF_SEARCH_CEILING, Math.max(EF_SEARCH_FLOOR, ...fetches));
    const branches = probes.map((probe, index) => {
      const column = vectorColumn(probe.using);
      const literal = vectorLiteral(probe.vector);
      const { where, params } = compileProbeFilter(probe.filter, UNIT_BOUND_SCOPES);
      return {
        sql:
          `(select ${index} as probe, id, payload, 1 - (${column} <=> ?::vector) as score ` +
          `from ${quoted(table)} where ${where} order by ${column} <=> ?::vector limit ${fetches[index]})`,
        params: [literal, ...params, literal],
      };
    });
    const rows = await this.sql.transaction(async (tx) => {
      await tx.run('set local hnsw.iterative_scan = relaxed_order');
      await tx.run(`set local hnsw.ef_search = ${efSearch}`);
      return tx.all<SearchRow>(
        branches.map((branch) => branch.sql).join(' union all '),
        branches.flatMap((branch) => branch.params),
      );
    });
    const byProbe = probes.map((): SearchRow[] => []);
    for (const row of rows) byProbe[row.probe]?.push(row);
    return probes.map((probe, index) => {
      const seen = new Set<string>();
      const hits: MemoryHit[] = [];
      for (const row of byProbe[index].sort((a, b) => b.score - a.score)) {
        const memory = fromPayload(row.payload);
        if (memory === null || seen.has(memory.contentHash)) continue;
        seen.add(memory.contentHash);
        hits.push({ ...memory, score: row.score });
        if (hits.length === probe.limit) break;
      }
      return hits;
    });
  }

  async replaceRunChunks(
    sourceRunId: string,
    chunks: readonly StoredChunk[],
    scope?: ChunkKindScope,
  ): Promise<number> {
    const table = await this.bound();
    const storedAt = this.now().toISOString();
    // The kinds the writer owns, when it names them: an unscoped replace takes the run's every row.
    const kinds = scope?.kinds ?? [];
    const owned = kinds.length === 0 ? '' : ` and payload->>'kind' = ANY(?::text[])`;
    const params = kinds.length === 0 ? [sourceRunId] : [sourceRunId, textArrayLiteral(kinds)];
    return this.sql.transaction(async (tx) => {
      await tx.run(`delete from ${quoted(table)} where payload->>'runId' = ?${owned}`, params);
      return this.upsert(
        tx,
        table,
        chunks.map((chunk) => ({
          id: pointId(sourceRunId, chunk.source.ref),
          payload: toPayload(chunk, storedAt),
          vectors: chunk.vectors,
        })),
      );
    });
  }

  async retractRun(sourceRunId: string): Promise<number> {
    const table = await this.bound();
    const { affectedRows } = await this.sql.run(
      `delete from ${quoted(table)} where payload->>'runId' = ?`,
      [sourceRunId],
    );
    return affectedRows;
  }

  /**
   * Read before it goes, by id: the id is a pure function of `(runId, ref)`,
   * so a point never stored selects nothing and nothing is deleted. A point
   * whose payload this module would not write is none of its memories — a
   * search skips it — so it is left standing and answered as unreadable,
   * never as absent.
   */
  async retractPoint(point: PointRef): Promise<PointRetraction> {
    const table = await this.bound();
    const id = pointId(point.runId, point.ref);
    const held = await this.sql.one<{ payload: unknown }>(
      `select payload from ${quoted(table)} where id = ?`,
      [id],
    );
    if (held === undefined) return { status: 'not-held' };
    const memory = fromPayload(held.payload);
    if (memory === null) return { status: 'unreadable' };
    await this.sql.run(`delete from ${quoted(table)} where id = ?`, [id]);
    return { status: 'removed', memory };
  }

  /**
   * Write the support counts of points that already stand, leaving the rest of
   * each payload alone: `||` merges one key into the jsonb. One statement per
   * point, because each carries its own counts — and each selects its point by
   * `(runId, ref)` rather than by id, so a point that has since gone updates
   * nothing, which is the behaviour this wants.
   */
  async setSupport(
    updates: readonly { point: PointRef; support: { confirms: number; contradicts: number } }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const table = await this.bound();
    await Promise.all(
      updates.map((update) =>
        this.sql.run(
          `update ${quoted(table)} set payload = payload || jsonb_build_object('support', ?::jsonb) ` +
            `where payload->>'runId' = ? and payload->>'ref' = ?`,
          [JSON.stringify(update.support), update.point.runId, update.point.ref],
        ),
      ),
    );
  }

  /**
   * Points carried over from the store that held them before, written as they
   * were: the payload verbatim, `storedAt` included, under the id they had —
   * `memory_support.point_id` names those ids, so they must not change. A
   * point is refused by name when its payload is not one this store writes,
   * when its id is not the one its run and ref derive, or when a vector is
   * missing or not the store's width; the rest are upserted, so an import run
   * twice replaces rather than doubles. Not on the port: nothing that runs
   * imports, only the carry-over command. A dry run checks every point and
   * writes none, counting what it would have written.
   */
  async importPoints(
    points: readonly ImportedPoint[],
    options: { dryRun?: boolean } = {},
  ): Promise<ImportOutcome> {
    const accepted: Row[] = [];
    const refused: ImportOutcome['refused'] = [];
    for (const point of points) {
      const checked = this.admit(point);
      if (typeof checked === 'string') refused.push({ id: point.id, reason: checked });
      else accepted.push(checked);
    }
    if (options.dryRun !== true && accepted.length > 0) {
      const table = await this.bound();
      await this.sql.transaction((tx) => this.upsert(tx, table, accepted));
    }
    return { imported: accepted.length, refused };
  }

  /** The row an imported point becomes, or why it is refused. */
  private admit(point: ImportedPoint): Row | string {
    const parsed = payloadSchema.safeParse(point.payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at =
        issue === undefined ? '' : ` (${issue.path.join('.') || 'payload'}: ${issue.message})`;
      return `point ${point.id} carries a payload this store does not write${at}`;
    }
    const expected = pointId(parsed.data.runId, parsed.data.ref);
    if (point.id !== expected) {
      return `point ${point.id} is not at the id its run and ref derive, ${expected}`;
    }
    const vectors: Partial<Record<VectorName, readonly number[]>> = {};
    for (const name of VECTOR_NAMES) {
      const vector = point.vectors[name];
      if (vector === undefined) return `point ${point.id} carries no ${name} vector`;
      if (vector.length !== this.dimensions) {
        return `the ${name} vector of point ${point.id} has ${vector.length} dimensions, not the store's ${this.dimensions}`;
      }
      vectors[name] = vector;
    }
    return { id: point.id, payload: point.payload, vectors: vectors as Row['vectors'] };
  }

  /**
   * Rows written in batches, each an `insert … on conflict (id) do update` so
   * an id already held takes the new row — one row per id, the last winning,
   * since a statement that meets one id twice is refused by the database
   * (SQLSTATE 21000) rather than resolved. Answers how many rows it wrote.
   */
  private async upsert(tx: SqlExecutor, table: string, rows: readonly Row[]): Promise<number> {
    const latest = [...new Map(rows.map((row) => [row.id, row])).values()];
    for (let start = 0; start < latest.length; start += UPSERT_BATCH) {
      const batch = latest.slice(start, start + UPSERT_BATCH);
      await tx.run(
        `insert into ${quoted(table)} (${UPSERT_COLUMNS}) values ${batch.map(() => UPSERT_ROW).join(', ')} ` +
          `on conflict (id) do update set ${UPSERT_UPDATE}`,
        batch.flatMap((row) => [
          row.id,
          JSON.stringify(row.payload),
          ...VECTOR_NAMES.map((name) => vectorLiteral(row.vectors[name])),
        ]),
      );
    }
    return latest.length;
  }

  private async bound(): Promise<string> {
    if (this.table === null) throw new Error('memory store: no embedding model to bind to');
    await this.ensure(this.table);
    return this.table;
  }

  /**
   * The table exists with every declared index — on every boot rather than
   * only with the table, so a field declared after a table was built is
   * indexed on the next boot without a generation bump. Once per process: the
   * first call's ensure is kept as a promise while it runs, so a second first
   * call — the boot's `verify` beside an early run — awaits it instead of
   * running the list against itself; a failed one is forgotten, so the next
   * call looks again. A refused index — a `create index` the database will
   * not run, for want of memory or of a permission — fails the ensure on
   * purpose: there is no "index refused, carry on" path on pgvector, where the
   * schema is either whole or not made sure of, so `verify` answers
   * `unreachable` with the refused statement's error as its note and every
   * write refuses until it is.
   */
  private ensure(table: string): Promise<void> {
    this.ensuring ??= ensureVectorSchema(this.sql, schemaFor(table, this.dimensions)).catch(
      (error: unknown) => {
        this.ensuring = null;
        throw error;
      },
    );
    return this.ensuring;
  }
}
