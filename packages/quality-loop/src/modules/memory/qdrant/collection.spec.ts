import { describe, expect, it } from 'vitest';

import { EVIDENCE_KINDS, contentHash } from '../../../orchestrators/memory/ports';
import { INDEXED_FIELDS, fromPayload, rootOf, toPayload } from './collection';

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
    model: 'fake-embedding',
  };
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
    const hit = fromPayload(payload, 0.91);
    expect(hit).toEqual({
      text: chunk.text,
      contentHash: chunk.contentHash,
      model: chunk.model,
      evidence: chunk.evidence,
      digestRunId: 'digest-run',
      source: chunk.source,
      score: 0.91,
    });
    // A point written before the widening — run-row evidence only — still parses.
    const earlier = toPayload(
      { ...chunk, evidence: [{ kind: 'criterion', ref: 'c1' }] },
      '2026-09-06T00:00:00.000Z',
    );
    expect(fromPayload(earlier, 0.5)?.evidence).toEqual([{ kind: 'criterion', ref: 'c1' }]);
    // A kind nobody declared is a point this module did not write.
    expect(
      fromPayload({ ...payload, evidence: [{ kind: 'paragraph', ref: 'p1' }] }, 0.5),
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
    const payload = toPayload({ ...chunk, facets }, '2026-10-03T00:00:00.000Z');

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
    expect(fromPayload(payload, 0.8)?.facets).toEqual(facets);

    // A point stored before facets existed reads exactly as it did: no facets at all.
    const older = fromPayload(toPayload(chunk, '2026-09-06T00:00:00.000Z'), 0.5);
    expect(older).not.toBeNull();
    expect(older === null ? null : 'facets' in older).toBe(false);

    // A facet value nobody declared is a point this module did not write.
    expect(fromPayload({ ...payload, polarity: 'maybe' }, 0.5)).toBeNull();
  });
});
