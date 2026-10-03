import { DOCUMENT_MEMORY_KINDS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import { fromRun } from '../../../pipelines/experience-digest/from-run';
import { renderGoal as renderRecord } from '../../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../../pipelines/experience-digest/testing';
import { memoriesToStore } from '../digest/read-digest';
import { ACCEPT_AT, digestInput, readoutTrace } from '../testing';
import { CHUNK_KINDS } from '../../../pipelines/memory-recall/input';
import { chunkKind, chunksOf, DEFAULT_CHUNK_KIND, type OwnedKinds } from './chunks';

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
    const owned: OwnedKinds = [DEFAULT_CHUNK_KIND, ...DOCUMENT_MEMORY_KINDS];
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
      owned,
    ).map((chunk) => chunk.source.kind);
    // A digest that declares nothing writes what every digest wrote before one could.
    expect(kinds).toEqual(['profile_fact', 'profile_story', 'claim_boundary', DEFAULT_CHUNK_KIND]);
    expect(DEFAULT_CHUNK_KIND).toBe('lesson');
    // A kind this writer does not own is retyped rather than refused: the fact is
    // sound and only its filing is wrong, and a point outside its caller's replace
    // scope would be orphaned by the next re-digest.
    expect(chunkKind('not_a_kind', owned)).toBe(DEFAULT_CHUNK_KIND);
    expect(chunkKind(undefined, owned)).toBe(DEFAULT_CHUNK_KIND);
    for (const kind of DOCUMENT_MEMORY_KINDS) expect(chunkKind(kind, owned)).toBe(kind);
    // And a kind the STORE knows but this writer does not own is still retyped:
    // written outside its caller's replace scope, it would orphan on re-digest.
    expect(chunkKind('pattern', owned)).toBe(DEFAULT_CHUNK_KIND);
    expect(chunkKind('profile_story', [DEFAULT_CHUNK_KIND])).toBe(DEFAULT_CHUNK_KIND);
    expect(CHUNK_KINDS).toContain('pattern');

    // Where a stray is filed is the writer's OWN first kind, never a fixed one:
    // a writer owning no lessons would otherwise file it outside its own replace
    // scope and orphan it on the next re-digest. Requiring every writer to own
    // `lesson` would close that and open the worse half — owning a kind means
    // replacing it, so the knowledge writer, which owns items and findings and
    // deliberately no lesson, would delete the memory orchestrator's lessons.
    const noLessons: OwnedKinds = ['fact', 'pattern'];
    expect(chunkKind(undefined, noLessons)).toBe('fact');
    expect(chunkKind('profile_story', noLessons)).toBe('fact');
    expect(noLessons).not.toContain(DEFAULT_CHUNK_KIND);
    for (const kinds of [owned, noLessons]) {
      expect(kinds).toContain(chunkKind(undefined, kinds));
      expect(kinds).toContain(chunkKind('a_kind_nobody_owns', kinds));
    }
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
      // The experience digest declares no kind, and its writer owns only lessons.
      [DEFAULT_CHUNK_KIND],
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
