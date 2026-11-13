import { tableName } from '@sysdesign/pgvector-kit';
import { describe, expect, it } from 'vitest';

import { contentHash, EVIDENCE_KINDS, VECTOR_NAMES } from '../../../orchestrators/memory/ports';
import { chunkSourceSchema } from '../../../pipelines/memory-recall/input';
import { collectionName, fromPayload, INDEXED_FIELDS, schemaFor, toPayload } from './collection';

/** A fact digested from a document, as `chunksOf` shapes it: its evidence is a section, not a run's rows. */
const factChunk = () => {
  const text =
    'Alex Example has six years of professional TypeScript, 2020–2026, at Acme — applies when a form asks how many years of TypeScript experience the applicant has';
  return {
    text,
    keys: {
      condition: 'a form asks how many years of TypeScript experience the applicant has',
      lesson: 'Alex Example has six years of professional TypeScript, 2020–2026, at Acme',
    },
    contentHash: contentHash(text),
    source: {
      runId: 'digest-run',
      pipeline: 'document-digest',
      kind: 'lesson' as const,
      ref: 'memory.1',
      decision: 'accept' as const,
      iteration: 1,
      when: '2026-10-02',
    },
    evidence: [
      { kind: 'section' as const, ref: 'section.2' },
      { kind: 'section' as const, ref: 'section.3' },
    ],
    digestRunId: 'digest-run',
    lineage: {
      judged: { runId: 'digest-run', iteration: 1 },
      adoptedFrom: null,
      goalHash: contentHash('the composed document goal'),
    },
    model: 'fake-embedding',
  };
};

/** A lineage naming an adopted run, so every lineage field holds a value. */
const ADOPTED_LINEAGE = {
  judged: { runId: 'grade-run', iteration: 2 },
  adoptedFrom: { runId: 'grade-run', iteration: 2 },
  goalHash: contentHash('design a link shortener'),
};

/** The identifier every `create index` statement names, in order. */
const indexNamesOf = (statements: readonly string[]): string[] =>
  statements.flatMap((statement) => {
    const match = /^create index if not exists "([^"]+)"/.exec(statement);
    return match === null ? [] : [match[1]];
  });

describe('the memory point payload', () => {
  it('[QL-40] round-trips a fact whose evidence is document sections, under the widened evidence kinds', () => {
    expect(EVIDENCE_KINDS).toEqual(['finding', 'criterion', 'section']);
    const chunk = factChunk();
    const payload = toPayload(chunk, '2026-10-02T00:00:00.000Z');
    expect(payload).toMatchObject({
      pipeline: 'document-digest',
      kind: 'lesson',
      evidence: chunk.evidence,
      digestRunId: 'digest-run',
    });
    const memory = fromPayload(payload);
    expect(memory).toEqual({
      text: chunk.text,
      contentHash: chunk.contentHash,
      model: chunk.model,
      evidence: chunk.evidence,
      digestRunId: 'digest-run',
      lineage: chunk.lineage,
      source: chunk.source,
    });
    // A point written before the widening — run-row evidence only — still parses.
    const earlier = toPayload(
      { ...chunk, evidence: [{ kind: 'criterion', ref: 'c1' }] },
      '2026-09-06T00:00:00.000Z',
    );
    expect(fromPayload(earlier)?.evidence).toEqual([{ kind: 'criterion', ref: 'c1' }]);
    // A kind nobody declared is a point this module did not write.
    expect(fromPayload({ ...payload, evidence: [{ kind: 'paragraph', ref: 'p1' }] })).toBeNull();
    // [QL-69] A declared scope rides on the point and comes back as declared; a point written before scopes carries none.
    const scoped = toPayload({ ...chunk, scope: 'unit' }, '2026-10-12T00:00:00.000Z');
    expect(scoped.scope).toBe('unit');
    expect(fromPayload(scoped)?.scope).toBe('unit');
    expect('scope' in (fromPayload(payload) ?? {})).toBe(false);
  });

  it('[QL-71] carries the unit of work a unit-bound memory was recorded for beside its scope, never inside its source, and a point stored without one reads without one', () => {
    const chunk = { ...factChunk(), scope: 'unit' as const, unitKey: 'company=acme' };
    const payload = toPayload(chunk, '2026-10-14T00:00:00.000Z');
    expect(payload).toMatchObject({ scope: 'unit', unitKey: 'company=acme' });
    const memory = fromPayload(payload);
    expect(memory).toMatchObject({ scope: 'unit', unitKey: 'company=acme', source: chunk.source });
    // The source is exactly the recall pipeline's own shape, which a coach's recall parses strictly.
    expect(Object.keys(memory?.source ?? {}).sort()).toEqual(
      Object.keys(chunkSourceSchema.shape).sort(),
    );
    expect(chunkSourceSchema.safeParse(memory?.source).success).toBe(true);
    const unnamed = fromPayload(toPayload({ ...chunk, unitKey: undefined }, '2026-10-14'));
    expect(unnamed === null ? null : 'unitKey' in unnamed).toBe(false);
    // An empty key is one this module never writes: the point is not its memory.
    expect(fromPayload({ ...payload, unitKey: '' })).toBeNull();
    // Both are indexed: every search filters by them.
    expect(INDEXED_FIELDS).toEqual(expect.arrayContaining(['scope', 'unitKey']));
  });

  it('[QL-60] carries the lineage of the cited iteration, reads a point written before it as null, and refuses a malformed one', () => {
    const adopted = { ...factChunk(), lineage: ADOPTED_LINEAGE };
    const payload = toPayload(adopted, '2026-10-02T00:00:00.000Z');
    expect(payload.lineage).toEqual(adopted.lineage);
    expect(fromPayload(payload)?.lineage).toEqual(adopted.lineage);

    // A point written before the payload carried lineage has none, and still parses.
    const { lineage, ...earlier } = payload;
    void lineage;
    expect(fromPayload(earlier)?.lineage).toBeNull();
    expect(fromPayload({ ...earlier, lineage: null })?.lineage).toBeNull();
    // A lineage this module would not write is a point it did not write.
    expect(
      fromPayload({ ...payload, lineage: { ...adopted.lineage, goalHash: 'short' } }),
    ).toBeNull();
  });

  it('[QL-41] round-trips the facets flat, a point written before them carries none, and every indexed field is a text the payload carries', () => {
    const chunk = factChunk();
    const facets = {
      polarity: 'avoid' as const,
      dimension: 'quality_attributes',
      topics: ['cache-aside', 'latency-budget'],
      criterionKinds: ['non_functional'],
      findingTypes: ['contradiction'],
      transition: 'resolved' as const,
      grounding: 'proven' as const,
      severity: 'high' as const,
      support: { confirms: 2, contradicts: 0 },
    };
    // A unit-bound scope with its unit, so every indexed field holds a value to check.
    const payload = toPayload(
      { ...chunk, lineage: ADOPTED_LINEAGE, facets, scope: 'unit', unitKey: 'company=acme' },
      '2026-10-03T00:00:00.000Z',
    );

    // Flat on the payload, because that is what a filter can read by key.
    expect(payload).toMatchObject({
      dimension: 'quality_attributes',
      polarity: 'avoid',
      transition: 'resolved',
      topics: ['cache-aside', 'latency-budget'],
    });
    // Every indexed field is a key the payload carries whose value is a text:
    // the index is an expression over `payload->>'<field>'`, which reads the
    // value as text, and a filter compares it to a list of texts — an array or
    // an object there would read as its JSON and match no list.
    for (const field of INDEXED_FIELDS) {
      expect(Object.keys(payload)).toContain(field);
      expect(typeof payload[field], `the value at ${field}`).toBe('string');
    }
    expect(fromPayload(payload)?.facets).toEqual(facets);

    // A point stored before facets existed reads exactly as it did: no facets at all.
    const older = fromPayload(toPayload(chunk, '2026-09-06T00:00:00.000Z'));
    expect(older).not.toBeNull();
    expect(older === null ? null : 'facets' in older).toBe(false);

    // A facet value nobody declared is a point this module did not write.
    expect(fromPayload({ ...payload, polarity: 'maybe' })).toBeNull();
  });

  it('[QL-41] [QL-60] MERGE GUARD — a point carrying facets and lineage reads back with both; lineage stays nested beside the flat facets and is not an indexed field', () => {
    // The payload schema is strict, so a key it does not declare makes the
    // point unreadable rather than merely unfacetted: a resolution of the
    // facets and the lineage that dropped either declaration fails here.
    const facets = {
      polarity: 'do' as const,
      topics: ['idempotency'],
      grounding: 'proven' as const,
    };
    const chunk = { ...factChunk(), lineage: ADOPTED_LINEAGE, facets };
    const memory = fromPayload(toPayload(chunk, '2026-10-03T00:00:00.000Z'));
    expect(memory?.lineage).toEqual(ADOPTED_LINEAGE);
    expect(memory?.facets).toEqual(facets);
    // A recall screens by lineage off the hits after fusion, never in a store
    // filter, so the pgvector move recreated no index on it (MEM-7).
    expect(INDEXED_FIELDS.some((field) => field.startsWith('lineage'))).toBe(false);
  });
});

describe('the collection’s table', () => {
  it('[QL-17] [QL-41] declares the table with a vector column per name at the width, one expression index per filtered field and an HNSW cosine index per vector, every identifier within the server’s limit', () => {
    const table = tableName(collectionName('text-embedding-3-small', 1536));
    expect(table).toBe('vec_quality_memory__v2__text_embedding_3_small__1536');
    const statements = schemaFor(table, 1536);
    expect(statements[0]).toBe(
      `create table if not exists "${table}" (id uuid primary key, payload jsonb not null, "condition" vector(1536) not null, "lesson" vector(1536) not null)`,
    );
    const indexes = statements.slice(1).map((statement) => {
      const match = /^create index if not exists "([^"]+)" on "([^"]+)" (.+)$/.exec(statement);
      expect(match, statement).not.toBeNull();
      return { name: match?.[1] ?? '', on: match?.[2], how: match?.[3] ?? '' };
    });
    expect(indexes.map((index) => index.how)).toEqual([
      ...INDEXED_FIELDS.map((field) => `((payload->>'${field}'))`),
      ...VECTOR_NAMES.map((name) => `using hnsw ("${name}" vector_cosine_ops)`),
    ]);
    expect(indexes.every((index) => index.on === table)).toBe(true);
    // Every index is named within 63 bytes, distinctly, after what it indexes.
    const names = indexes.map((index) => index.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63);
    expect(names[0]).toMatch(/_runId_idx$/);
    expect(names.at(-1)).toMatch(/_lesson_hnsw$/);
    // A table whose own name fills the limit still names its indexes within
    // it, and apart from another such table's: the stem carries a digest of
    // the whole table name, not a prefix two long names share.
    const long = tableName(
      collectionName('a-model-whose-name-runs-past-the-identifier-limit-by-a-wide-margin', 3072),
    );
    const other = tableName(
      collectionName(
        'a-model-whose-name-runs-past-the-identifier-limit-by-a-wide-margin-two',
        3072,
      ),
    );
    expect(long.slice(0, 40)).toBe(other.slice(0, 40));
    const longNames = indexNamesOf(schemaFor(long, 3072));
    const otherNames = indexNamesOf(schemaFor(other, 3072));
    expect(longNames).toHaveLength(names.length);
    for (const name of [...longNames, ...otherNames]) {
      expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63);
    }
    expect(longNames.filter((name) => otherNames.includes(name))).toEqual([]);
    // Nothing unread reaches the statement text: a table name outside the
    // kit's shape and a width that is not a positive whole number are refused.
    expect(() => schemaFor('Vec_Table', 4)).toThrow(/\[a-z0-9_\]/);
    expect(() => schemaFor('vec_x y', 4)).toThrow(/\[a-z0-9_\]/);
    expect(() => schemaFor('vec_x', 0)).toThrow(/positive whole width/);
    expect(() => schemaFor('vec_x', 1.5)).toThrow(/positive whole width/);
  });
});
