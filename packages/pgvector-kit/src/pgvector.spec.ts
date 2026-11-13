import {
  collectionName,
  ensureVectorSchema,
  tableName,
  textArrayLiteral,
  vectorLiteral,
  VectorExtensionMissing,
} from './pgvector';
import { recordingExecutor } from './testing';

describe('a pgvector collection', () => {
  it('[PGV-1] is named by its store, generation, model and width, the model made safe for a name', () => {
    expect(collectionName('agentic-memory', 'v2', 'text-embedding-3-small', 1536)).toBe(
      'agentic-memory__v2__text-embedding-3-small__1536',
    );
    expect(collectionName('quality-memory', 'v2', 'org/model:latest', 8)).toBe(
      'quality-memory__v2__org-model-latest__8',
    );
  });

  it('[PGV-1] lives in a table named for it, every character an identifier refuses replaced', () => {
    expect(tableName('quality-memory__v2__text-embedding-3-small__1536')).toBe(
      'vec_quality_memory__v2__text_embedding_3_small__1536',
    );
    expect(tableName('Agentic-Memory__v2__org/Model:latest__8')).toBe(
      'vec_agentic_memory__v2__org_model_latest__8',
    );
  });

  it('[PGV-1] hashes a name past PostgreSQL’s 63-byte limit: still an identifier, the same every time, different for a different collection', () => {
    const long = collectionName(
      'quality-memory',
      'v2',
      'text-embedding-3-large-finetuned-for-recall-2026',
      3072,
    );
    expect(`vec_${long}`.length).toBeGreaterThan(63);
    const table = tableName(long);
    expect(table).toHaveLength(63);
    expect(table).toMatch(/^vec_quality_memory__v2__[a-z0-9_]{26}_[0-9a-f]{12}$/);
    expect(tableName(long)).toBe(table);
    // The readable head is the same for a name that differs past the cut; the digest tells them apart.
    const other = tableName(`${long}-b`);
    expect(other.slice(0, 50)).toBe(table.slice(0, 50));
    expect(other).not.toBe(table);
    expect(other).toHaveLength(63);
  });
});

describe('literals the database parses', () => {
  it('[PGV-2] writes a vector as pgvector reads it, each element as JavaScript prints it', () => {
    expect(vectorLiteral([0.1, -2, 3e-7, 1])).toBe('[0.1,-2,3e-7,1]');
    expect(vectorLiteral([0])).toBe('[0]');
  });

  it('[PGV-2] refuses an empty vector and a non-finite element, naming its index', () => {
    expect(() => vectorLiteral([])).toThrow('an empty vector has no literal');
    expect(() => vectorLiteral([1, Number.NaN, 2])).toThrow(
      'vector element 1 is not a finite number: NaN',
    );
    expect(() => vectorLiteral([Number.NEGATIVE_INFINITY])).toThrow(
      'vector element 0 is not a finite number: -Infinity',
    );
  });

  it('[PGV-2] writes texts as a PostgreSQL array, every value quoted with its quotes and backslashes escaped', () => {
    expect(textArrayLiteral(['lesson', 'profile_fact'])).toBe('{"lesson","profile_fact"}');
    expect(textArrayLiteral(['say "hi"', 'back\\slash', 'a,b}', 'NULL', ''])).toBe(
      '{"say \\"hi\\"","back\\\\slash","a,b}","NULL",""}',
    );
    expect(textArrayLiteral([])).toBe('{}');
  });
});

const EXTENSION_CHECK = "select 1 from pg_extension where extname = 'vector'";
const STATEMENTS = [
  'create table if not exists "vec_t" (id uuid primary key, payload jsonb not null, embedding vector(4) not null)',
  'create index if not exists "vec_t_kind_idx" on "vec_t" ((payload->>\'kind\'))',
  'create index if not exists "vec_t_embedding_hnsw" on "vec_t" using hnsw (embedding vector_cosine_ops)',
];

/** A database with or without the extension, whose statements answer as `onStatement` says. */
const databaseWith = (
  extension: boolean,
  onStatement: (statement: string) => void = () => undefined,
) =>
  recordingExecutor((sql) => {
    if (sql === EXTENSION_CHECK) return extension ? [{ installed: 1 }] : [];
    onStatement(sql);
    return undefined;
  });

const raceError = (code: string) => Object.assign(new Error(`lost the create: ${code}`), { code });

describe('ensuring a collection’s schema', () => {
  it('[PGV-3] refuses a database without the vector extension by name, before any statement runs', async () => {
    const sql = databaseWith(false);
    await expect(ensureVectorSchema(sql, STATEMENTS)).rejects.toThrow(VectorExtensionMissing);
    await expect(ensureVectorSchema(sql, STATEMENTS)).rejects.toThrow(/pnpm db:migrate/);
    expect(sql.calls.map((call) => call.sql)).toEqual([EXTENSION_CHECK, EXTENSION_CHECK]);
  });

  it('[PGV-3] runs every statement in order once the extension stands', async () => {
    const sql = databaseWith(true);
    await ensureVectorSchema(sql, STATEMENTS);
    expect(sql.calls.map((call) => call.sql)).toEqual([EXTENSION_CHECK, ...STATEMENTS]);
  });

  it('[PGV-3] runs the list once more from the start when another process won a create, whichever code the loser got and however the ORM wrapped it', async () => {
    const refusals = [
      raceError('23505'),
      new Error('wrapped by the ORM', { cause: raceError('42P07') }),
    ];
    for (const refusal of refusals) {
      let refused = false;
      const sql = databaseWith(true, (statement) => {
        if (statement === STATEMENTS[1] && !refused) {
          refused = true;
          throw refusal;
        }
      });
      await expect(ensureVectorSchema(sql, STATEMENTS)).resolves.toBeUndefined();
      expect(sql.calls.map((call) => call.sql)).toEqual([
        EXTENSION_CHECK,
        STATEMENTS[0],
        STATEMENTS[1],
        ...STATEMENTS,
      ]);
    }
  });

  it('[PGV-3] lets any other failure through, and a create lost twice, with nothing run again', async () => {
    const denied = Object.assign(new Error('permission denied for schema public'), {
      code: '42501',
    });
    const refusing = databaseWith(true, (statement) => {
      if (statement === STATEMENTS[1]) throw denied;
    });
    await expect(ensureVectorSchema(refusing, STATEMENTS)).rejects.toBe(denied);
    expect(refusing.calls.map((call) => call.sql)).toEqual([
      EXTENSION_CHECK,
      STATEMENTS[0],
      STATEMENTS[1],
    ]);

    const lost = raceError('42P07');
    const losing = databaseWith(true, (statement) => {
      if (statement === STATEMENTS[1]) throw lost;
    });
    await expect(ensureVectorSchema(losing, STATEMENTS)).rejects.toBe(lost);
    expect(losing.calls.map((call) => call.sql)).toEqual([
      EXTENSION_CHECK,
      STATEMENTS[0],
      STATEMENTS[1],
      STATEMENTS[0],
      STATEMENTS[1],
    ]);
  });
});
