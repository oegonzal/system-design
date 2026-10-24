import { describe, expect, it } from 'vitest';

import { EVIDENCE_KINDS, contentHash } from '../../../orchestrators/memory/ports';
import { chunkSourceSchema } from '../../../pipelines/memory-recall/input';
import { INDEXED_FIELDS, fromPayload, toPayload } from './collection';

/** The payload key a (possibly dotted) indexed field path begins at. */
const rootOf = (field: string): string => field.split('.')[0];

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

/** A lineage naming an adopted run, so every lineage path the store indexes holds a value. */
const ADOPTED_LINEAGE = {
  judged: { runId: 'grade-run', iteration: 2 },
  adoptedFrom: { runId: 'grade-run', iteration: 2 },
  goalHash: contentHash('design a link shortener'),
};

/** The value at a (possibly dotted) payload path, as Qdrant addresses one. */
const valueAt = (payload: Record<string, unknown>, field: string): unknown =>
  field.split('.').reduce<unknown>((at, key) => {
    if (at === null || typeof at !== 'object') return undefined;
    return (at as Record<string, unknown>)[key];
  }, payload);

/**
 * The index a value of this shape needs. An array indexes as its member type:
 * Qdrant indexes each element, which is why `topics` is a keyword index and not
 * a type of its own.
 */
const indexFor = (value: unknown): string => {
  const one = Array.isArray(value) ? value[0] : value;
  if (typeof one === 'number') return Number.isInteger(one) ? 'integer' : 'float';
  if (typeof one === 'boolean') return 'bool';
  return 'keyword';
};

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
    // Both are indexed, as keywords: every search filters by them.
    expect(INDEXED_FIELDS).toMatchObject({ scope: 'keyword', unitKey: 'keyword' });
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

  it('[QL-41] round-trips the facets flat, and a point written before them carries none', () => {
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
    // Lineage that names an adopted run, and a unit-bound scope with its unit, so every
    // indexed path holds a value to check.
    const payload = toPayload(
      { ...chunk, lineage: ADOPTED_LINEAGE, facets, scope: 'unit', unitKey: 'company=acme' },
      '2026-10-03T00:00:00.000Z',
    );

    // Flat on the payload, because that is what the store can index — and
    // every indexed field is one of these keys or a field of the source.
    expect(payload).toMatchObject({
      dimension: 'quality_attributes',
      polarity: 'avoid',
      transition: 'resolved',
      topics: ['cache-aside', 'latency-budget'],
    });
    // Every indexed field is a field the payload carries — a dotted path at the
    // key it begins at, so an index on a nested field is still checked here —
    // and the index it declares is the one its own value needs. Qdrant accepts
    // a keyword index on a number and then matches no integer filter against
    // it, so the declaration is only worth what the value agrees with; asking
    // the server instead would be circular, since it reports back whatever it
    // was asked for.
    for (const [field, schema] of Object.entries(INDEXED_FIELDS)) {
      expect(Object.keys(payload)).toContain(rootOf(field));
      const value = valueAt(payload, field);
      expect(value, `no value at ${field}`).toBeDefined();
      expect(indexFor(value), `the index ${field} declares`).toBe(schema);
    }
    expect(fromPayload(payload)?.facets).toEqual(facets);

    // A point stored before facets existed reads exactly as it did: no facets at all.
    const older = fromPayload(toPayload(chunk, '2026-09-06T00:00:00.000Z'));
    expect(older).not.toBeNull();
    expect(older === null ? null : 'facets' in older).toBe(false);

    // A facet value nobody declared is a point this module did not write.
    expect(fromPayload({ ...payload, polarity: 'maybe' })).toBeNull();
  });

  it('[QL-41] [QL-60] MERGE GUARD — a point carrying facets and lineage reads back with both, and both are indexed', () => {
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
    // Lineage stays nested beside the flat facets: what a recall screens by is indexed at its dotted paths.
    expect(Object.entries(INDEXED_FIELDS).filter(([field]) => rootOf(field) === 'lineage')).toEqual(
      [
        ['lineage.judged.runId', 'keyword'],
        ['lineage.adoptedFrom.runId', 'keyword'],
        ['lineage.goalHash', 'keyword'],
      ],
    );
  });
});
