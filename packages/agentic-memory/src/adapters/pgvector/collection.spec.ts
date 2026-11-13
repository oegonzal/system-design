import type { VisibilityFilter } from '../../ports';
import { collectionName, compileVisibilityFilter, schemaFor } from './collection';

const NOW = new Date('2026-10-01T00:00:00.000Z');

const request = (overrides: Partial<VisibilityFilter> = {}): VisibilityFilter => ({
  spaceId: 'space-1',
  registers: ['facts', 'episodes'],
  partition: 't1',
  scope: { tenant: 't1' },
  scopeKeys: ['tenant', 'user'],
  now: NOW,
  ...overrides,
});

/** The clause every search starts with: the space, a register, the partition. */
const IN_PARTITION = 'space_id = ? and register = any(?::text[]) and partition = ?';
const IN_PARTITION_PARAMS = ['space-1', '{"facts","episodes"}', 't1'];
const UNSET = '(scope->>?) is null';
const OWN_OR_UNSET = `(${UNSET} or scope->>? = ?)`;
const UNEXPIRED = '(expires_at is null or expires_at > ?::timestamptz)';

/** How many values the clause binds, so the parameters line up with the placeholders. */
const placeholders = (where: string): number => where.split('?').length - 1;

describe('the pgvector visibility filter', () => {
  it('[AGM-7] lets a request that names a key see memories without it and memories with its own value — never a sibling’s', () => {
    expect(compileVisibilityFilter(request({ scope: { tenant: 't1', user: 'u1' } }))).toEqual({
      where: `${IN_PARTITION} and ${OWN_OR_UNSET} and ${UNEXPIRED}`,
      params: [...IN_PARTITION_PARAMS, 'user', 'user', 'u1', NOW.toISOString()],
    });
    // A sibling's request binds only its own value, so u1's memory matches neither branch.
    expect(
      compileVisibilityFilter(request({ scope: { tenant: 't1', user: 'u2' } })).params,
    ).toEqual([...IN_PARTITION_PARAMS, 'user', 'user', 'u2', NOW.toISOString()]);
  });

  it('[AGM-7] keeps every narrower memory from a request that does not name its key', () => {
    expect(compileVisibilityFilter(request())).toEqual({
      where: `${IN_PARTITION} and ${UNSET} and ${UNEXPIRED}`,
      params: [...IN_PARTITION_PARAMS, 'user', NOW.toISOString()],
    });
  });

  it('[AGM-7] reads the policy’s scope keys, not the request’s', () => {
    // The request leaves `project` out, and a project's memories stay out with it.
    const compiled = compileVisibilityFilter(
      request({ scopeKeys: ['tenant', 'project', 'user'], scope: { tenant: 't1', user: 'u1' } }),
    );
    expect(compiled).toEqual({
      where: `${IN_PARTITION} and ${UNSET} and ${OWN_OR_UNSET} and ${UNEXPIRED}`,
      params: [...IN_PARTITION_PARAMS, 'project', 'user', 'user', 'u1', NOW.toISOString()],
    });
  });

  it('[AGM-7] needs nothing beyond the partition when the policy declares no other key', () => {
    expect(compileVisibilityFilter(request({ scopeKeys: ['tenant'] }))).toEqual({
      where: `${IN_PARTITION} and ${UNEXPIRED}`,
      params: [...IN_PARTITION_PARAMS, NOW.toISOString()],
    });
  });

  it('[AGM-7] keeps out what has expired by the request’s now', () => {
    const later = new Date('2026-12-01T00:00:00.000Z');
    const compiled = compileVisibilityFilter(request({ now: later }));
    expect(compiled.where).toContain(UNEXPIRED);
    expect(compiled.params).toContain(later.toISOString());
  });

  it('[AGM-6] narrows by the valid-time range it is given, and by every metadata value asked for', () => {
    const since = new Date('2026-09-01T00:00:00.000Z');
    const until = new Date('2026-09-30T00:00:00.000Z');
    const validFrom = (filter: VisibilityFilter): string[] =>
      compileVisibilityFilter(filter)
        .where.split(' and ')
        .filter((clause) => clause.startsWith('valid_from'));
    expect(validFrom(request())).toEqual([]);
    expect(validFrom(request({ since }))).toEqual(['valid_from >= ?::timestamptz']);
    expect(validFrom(request({ until }))).toEqual(['valid_from < ?::timestamptz']);
    expect(compileVisibilityFilter(request({ since, until }))).toEqual({
      where: `${IN_PARTITION} and ${UNSET} and ${UNEXPIRED} and valid_from >= ?::timestamptz and valid_from < ?::timestamptz`,
      params: [
        ...IN_PARTITION_PARAMS,
        'user',
        NOW.toISOString(),
        since.toISOString(),
        until.toISOString(),
      ],
    });
    expect(compileVisibilityFilter(request({ where: { topic: 'x', channel: 'mail' } }))).toEqual({
      where: `${IN_PARTITION} and ${UNSET} and ${UNEXPIRED} and metadata->>? = ? and metadata->>? = ?`,
      params: [...IN_PARTITION_PARAMS, 'user', NOW.toISOString(), 'topic', 'x', 'channel', 'mail'],
    });
  });

  it('[AGM-7] binds one value per placeholder in every shape, a key name or a value never spelled into the clause', () => {
    const shapes = [
      request(),
      request({ scope: { tenant: 't1', user: 'u1' } }),
      request({ scopeKeys: ['tenant'] }),
      request({
        scopeKeys: ['tenant', 'project', 'user', 'unit'],
        scope: { tenant: 't1', unit: 'w' },
      }),
      request({ registers: [] }),
      request({ since: NOW, until: NOW, where: { topic: 'x' } }),
      // A value that looks like a placeholder, a quote or a key path is a value.
      request({ spaceId: "it's ?", where: { "a->>'b'": '?' }, scope: { tenant: 't1', user: '?' } }),
    ];
    for (const shape of shapes) {
      const { where, params } = compileVisibilityFilter(shape);
      expect(placeholders(where)).toBe(params.length);
      expect(where).not.toContain("'");
    }
    expect(compileVisibilityFilter(request({ registers: [] })).params[1]).toBe('{}');
  });
});

describe('the collection and its table', () => {
  it('[AGM-9] binds the index generation, the model and the width, so a new model or width is a new collection', () => {
    expect(collectionName('text-embedding-3-small', 1536)).toBe(
      'agentic-memory__v2__text-embedding-3-small__1536',
    );
    expect(collectionName('text-embedding-3-small', 512)).not.toBe(
      collectionName('text-embedding-3-small', 1536),
    );
    // Anything a collection name may not hold reads as a hyphen.
    expect(collectionName('org/model:v2.1', 8)).toBe('agentic-memory__v2__org-model-v2-1__8');
  });

  it('[AGM-9] declares its table with the payload’s typed columns at the embedder’s width, and the indexes its filter and its ranking read', () => {
    const table = 'vec_agentic_memory__v2__spec__4';
    expect(schemaFor(table, 4)).toEqual([
      `create table if not exists "${table}" (id uuid primary key, space_id text not null, register text not null, partition text not null, scope jsonb not null, metadata jsonb not null, valid_from timestamptz not null, expires_at timestamptz null, embedding vector(4) not null)`,
      `create index if not exists "${table}_space_partition_idx" on "${table}" (space_id, partition)`,
      `create index if not exists "${table}_register_idx" on "${table}" (register)`,
      `create index if not exists "${table}_valid_from_idx" on "${table}" (valid_from)`,
      `create index if not exists "${table}_expires_at_idx" on "${table}" (expires_at)`,
      `create index if not exists "${table}_embedding_hnsw" on "${table}" using hnsw (embedding vector_cosine_ops)`,
    ]);
    for (const width of [0, -1, 1.5, Number.NaN]) {
      expect(() => schemaFor(table, width)).toThrow(
        `a vector column takes a positive whole width, got ${String(width)}`,
      );
    }
  });

  it('[AGM-9] keeps every index name an identifier the database will not cut, distinct per index and per table, for a table at the limit', () => {
    const names = (table: string): string[] =>
      schemaFor(table, 1536)
        .slice(1)
        .map((statement) => /create index if not exists "([^"]+)"/.exec(statement)?.[1] ?? '');
    const atLimit = `vec_${'a'.repeat(59)}`;
    expect(atLimit).toHaveLength(63);
    // The live table is past the limit with any suffix: 52 characters plus `_register_idx` is 65.
    const live = 'vec_agentic_memory__v2__text_embedding_3_small__1536';
    for (const table of [atLimit, live]) {
      const long = names(table);
      expect(long).toHaveLength(5);
      expect(new Set(long).size).toBe(5);
      for (const name of long) {
        expect(name.length).toBeLessThanOrEqual(63);
        expect(name).toMatch(
          /^vec_[a-z0-9_]+_[0-9a-f]{12}_(space_partition_idx|register_idx|valid_from_idx|expires_at_idx|embedding_hnsw)$/,
        );
      }
      // The same table names its indexes the same every time.
      expect(names(table)).toEqual(long);
    }
    // A sibling at the limit, differing only where the cut falls, names every index differently.
    const sibling = `vec_${'a'.repeat(58)}b`;
    expect(names(sibling).some((name) => names(atLimit).includes(name))).toBe(false);
  });
});
