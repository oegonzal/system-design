import { DOCUMENT_MEMORY_KINDS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import { fromRun } from '../../../pipelines/experience-digest/from-run';
import { renderGoal as renderRecord } from '../../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../../pipelines/experience-digest/testing';
import { memoriesToStore } from '../digest/read-digest';
import { ACCEPT_AT, digestInput, readoutTrace } from '../testing';
import { CHUNK_KINDS } from '../../../pipelines/memory-recall/input';
import { chunkKind, chunksOf, DEFAULT_CHUNK_KIND } from './chunks';

describe('a stored chunk', () => {
  it('[QL-40] is stored under the kind its digest declared, and under the old one when it declares none', () => {
    const origin = {
      runId: 'r1',
      pipeline: 'document-digest',
      decision: 'accept' as const,
      iteration: 1,
      when: '2026-10-03',
    };
    const memory = (position: number, kind?: string) => ({
      position,
      insight: `insight ${position}`,
      appliesWhen: `when ${position}`,
      evidence: [],
      ...(kind === undefined ? {} : { kind }),
    });
    const kinds = chunksOf(
      [
        memory(1, 'profile_fact'),
        memory(2, 'profile_story'),
        memory(3, 'claim_boundary'),
        memory(4),
      ],
      origin,
      'd1',
      'm',
    ).map((chunk) => chunk.source.kind);
    // A digest that declares nothing writes what every digest wrote before one could.
    expect(kinds).toEqual(['profile_fact', 'profile_story', 'claim_boundary', DEFAULT_CHUNK_KIND]);
    expect(DEFAULT_CHUNK_KIND).toBe('lesson');
    // A kind the store's vocabulary does not hold would have its point refused on
    // write, so it falls back rather than losing the fact.
    expect(chunkKind('not_a_kind')).toBe(DEFAULT_CHUNK_KIND);
    expect(chunkKind(undefined)).toBe(DEFAULT_CHUNK_KIND);
    for (const kind of DOCUMENT_MEMORY_KINDS) expect(chunkKind(kind)).toBe(kind);
  });

  it('[QL-40] every kind a document memory may declare is one the store can hold', () => {
    // The digest's enum and the store's are separate vocabularies; a kind in the
    // first and not the second is written, refused on upsert, and the fact is lost.
    for (const kind of DOCUMENT_MEMORY_KINDS) expect(CHUNK_KINDS).toContain(kind);
  });

  it('[QL-16] is a lesson addressed by the digest location, carrying the source run as provenance', () => {
    const record = fromRun(sampleRun());
    if (record === null) throw new Error('the sample run must compose');
    const { memories } = memoriesToStore(
      outputsOf(readoutTrace(digestInput(sampleDigest(), renderRecord(record)))),
      ACCEPT_AT,
    );
    const [chunk] = chunksOf(
      memories,
      {
        runId: 'run-a',
        pipeline: 'system-design',
        decision: 'accept',
        iteration: 2,
        when: '2026-09-06',
      },
      'digest-1',
      'fake-embedding',
    );
    expect(chunk.source).toEqual({
      runId: 'run-a',
      pipeline: 'system-design',
      kind: 'lesson',
      ref: 'memory.1',
      decision: 'accept',
      iteration: 2,
      when: '2026-09-06',
    });
    expect(chunk.text).toBe(
      `${sampleDigest().memories[0].insight} — applies when ${sampleDigest().memories[0].appliesWhen}`,
    );
    expect(chunk.contentHash).toHaveLength(64);
    expect(chunk.digestRunId).toBe('digest-1');
  });
});
