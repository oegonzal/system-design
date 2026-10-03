import { describe, expect, it } from 'vitest';

import { EVIDENCE_KINDS, contentHash } from '../../../orchestrators/memory/ports';
import { fromPayload, INDEXED_FIELDS, missingIndexes, toPayload } from './collection';

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
      lineage: chunk.lineage,
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

  it('[QL-43] carries the lineage of the cited iteration, reads a point written before it as null, and refuses a malformed one', () => {
    const chunk = factChunk();
    const adopted = {
      ...chunk,
      lineage: {
        judged: { runId: 'grade-run', iteration: 2 },
        adoptedFrom: { runId: 'grade-run', iteration: 2 },
        goalHash: contentHash('design a link shortener'),
      },
    };
    const payload = toPayload(adopted, '2026-10-02T00:00:00.000Z');
    expect(payload.lineage).toEqual(adopted.lineage);
    expect(fromPayload(payload, 0.5)?.lineage).toEqual(adopted.lineage);

    // A point written before the payload carried lineage has none, and still parses.
    const { lineage, ...earlier } = payload;
    void lineage;
    expect(fromPayload(earlier, 0.5)?.lineage).toBeNull();
    expect(fromPayload({ ...earlier, lineage: null }, 0.5)?.lineage).toBeNull();
    // A lineage this module would not write is a point it did not write.
    expect(
      fromPayload({ ...payload, lineage: { ...adopted.lineage, goalHash: 'short' } }, 0.5),
    ).toBeNull();
  });

  it('[QL-43] names the indexes a collection built before the lineage fields still lacks', () => {
    const schemaOf = (fields: readonly string[]) =>
      Object.fromEntries(fields.map((field) => [field, { data_type: 'keyword' }]));
    expect(INDEXED_FIELDS).toEqual([
      'runId',
      'pipeline',
      'kind',
      'lineage.judged.runId',
      'lineage.adoptedFrom.runId',
      'lineage.goalHash',
    ]);
    expect(missingIndexes({})).toEqual([...INDEXED_FIELDS]);
    expect(missingIndexes(schemaOf(['runId', 'pipeline', 'kind']))).toEqual([
      'lineage.judged.runId',
      'lineage.adoptedFrom.runId',
      'lineage.goalHash',
    ]);
    expect(missingIndexes(schemaOf(INDEXED_FIELDS))).toEqual([]);
  });
});
