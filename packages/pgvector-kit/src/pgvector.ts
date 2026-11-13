/**
 * What every pgvector-backed store in the repository does the same way: how a
 * collection is named and which table holds it, how a vector and a list of
 * texts are written as literals the database parses, the executor an adapter
 * runs its SQL through, and how a collection's table and indexes are made sure
 * of at boot. What a store keeps in its rows, which vector columns it has and
 * which fields it filters by are the store's.
 */
import { createHash } from 'node:crypto';

/**
 * A collection bound to what its vectors mean: the store, the generation of
 * what it embeds, the embedding model and the width — cosines across any two
 * of those are not comparable, so a change to one is a new collection, never a
 * migration.
 */
export const collectionName = (
  store: string,
  generation: string,
  model: string,
  dimensions: number,
): string => `${store}__${generation}__${model.replace(/[^A-Za-z0-9_-]/g, '-')}__${dimensions}`;

/** PostgreSQL cuts an identifier past NAMEDATALEN - 1 bytes without a word. */
const IDENTIFIER_BYTES = 63;
/** What a hashed name keeps of the readable form: with the separator and the digest it fills the limit exactly. */
const KEPT_CHARACTERS = 50;
const DIGEST_CHARACTERS = 12;

/**
 * The table a collection lives in: `vec_` and the collection lower-cased with
 * every character outside `[a-z0-9_]` replaced by `_`. A name past the
 * identifier limit keeps its first 50 characters and takes 12 hex characters
 * of the collection's sha256, so two different long collections get different
 * tables and the same collection always the same one. The result is quoted
 * (`"…"`) wherever it is interpolated into SQL.
 *
 * Two collections that differ only by letter case, or by `-` against `_`,
 * share one table, where Qdrant kept them apart — their vectors would rank
 * together. No such pair exists: each store builds its collection name from
 * the one embedding model its configuration names. The limitation is stated
 * rather than hashed away, which would have renamed every table the docs name.
 */
export const tableName = (collection: string): string => {
  const readable = `vec_${collection.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  // Every character left is ASCII, so the length is the byte count.
  if (readable.length <= IDENTIFIER_BYTES) return readable;
  const digest = createHash('sha256').update(collection, 'utf8').digest('hex');
  return `${readable.slice(0, KEPT_CHARACTERS)}_${digest.slice(0, DIGEST_CHARACTERS)}`;
};

/**
 * A vector as pgvector reads it, `[0.1,0.2,…]`, bound as `?::vector`. An empty
 * vector, a NaN and an infinity have no literal the column accepts, so they
 * are refused here by index rather than by the database as a parse error that
 * names nothing.
 */
export const vectorLiteral = (vector: readonly number[]): string => {
  if (vector.length === 0) {
    throw new Error('an empty vector has no literal: a vector column takes at least one element');
  }
  const broken = vector.findIndex((value) => !Number.isFinite(value));
  if (broken !== -1) {
    throw new Error(`vector element ${broken} is not a finite number: ${String(vector[broken])}`);
  }
  return `[${vector.map(String).join(',')}]`;
};

/**
 * A list of texts as a PostgreSQL array literal, `{"a","b"}`, bound as
 * `?::text[]`. Every value is quoted, with `\` and `"` escaped, so a comma, a
 * brace or the word NULL inside one stays a value; an empty list is `{}`.
 */
export const textArrayLiteral = (values: readonly string[]): string =>
  `{${values.map((value) => `"${value.replace(/[\\"]/g, '\\$&')}"`).join(',')}}`;

/**
 * The SQL an adapter runs, over whatever connection the host hands it: the
 * ORM's in the apps, a recorder in a spec. The placeholder convention is
 * MikroORM's, formatted on the client before the statement is sent — `?` is a
 * quoted value and `??` an identifier — so generated SQL must never contain a
 * literal `?`: the jsonb `?`, `?|` and `?&` operators are out (use
 * `(col->>'k') IS NULL` and `@>` instead), and a literal bound as text is cast
 * on its placeholder: `?::vector`, `?::text[]`, `?::jsonb`, `?::uuid[]`.
 */
export interface SqlExecutor {
  /** Every row a statement returns. */
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** The first row a statement returns, or none. */
  one<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  /** A statement run for its effect, with the rows it touched. */
  run(sql: string, params?: readonly unknown[]): Promise<{ affectedRows: number }>;
  /** `fn` inside one transaction: committed when it returns, rolled back when it throws. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** The connected database has no `vector` extension: the migration that installs it has not run there. */
export class VectorExtensionMissing extends Error {
  override readonly name = 'VectorExtensionMissing';
  constructor() {
    super(
      'the vector extension is not installed on the connected database: `pnpm db:migrate` installs it (the vector_extension migration)',
    );
  }
}

/** The extension's catalog row, there once the migration ran. */
const VECTOR_EXTENSION = "select 1 from pg_extension where extname = 'vector'";

/**
 * What the loser of two processes creating the same table at once is told:
 * `42P07` (the table already exists) when the winner's create landed before
 * the loser's check, and `23505` (a unique violation on `pg_type`) when both
 * passed the check and only one row fits the type's name.
 */
const CREATE_RACE_CODES: ReadonlySet<string> = new Set(['23505', '42P07']);

const codeOf = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { code } = value as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
};

/**
 * The SQLSTATE an error carries, read where the drivers put it: node-postgres
 * sets `code` on its error, MikroORM's wrapper copies every own property of
 * the error it wraps, and a wrapper that keeps the driver's error as its cause
 * is read one level down.
 */
const sqlStateOf = (error: unknown): string | undefined =>
  codeOf(error) ?? codeOf((error as { cause?: unknown } | null | undefined)?.cause);

const runEach = async (sql: SqlExecutor, statements: readonly string[]): Promise<void> => {
  for (const statement of statements) await sql.run(statement);
};

/**
 * The extension checked, then every statement in order — the `create … if not
 * exists` a store declares for its table and its indexes. Two processes may
 * boot at once: the loser of a create runs the list once more from the start
 * instead of failing, as a second boot would have; anything else that fails is
 * the caller's to see.
 */
export async function ensureVectorSchema(
  sql: SqlExecutor,
  statements: readonly string[],
): Promise<void> {
  if ((await sql.one(VECTOR_EXTENSION)) === undefined) throw new VectorExtensionMissing();
  try {
    await runEach(sql, statements);
  } catch (error) {
    const state = sqlStateOf(error);
    if (state === undefined || !CREATE_RACE_CODES.has(state)) throw error;
    await runEach(sql, statements);
  }
}
