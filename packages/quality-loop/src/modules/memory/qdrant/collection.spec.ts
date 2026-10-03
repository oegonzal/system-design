import { describe, expect, it } from 'vitest';

import { EVIDENCE_KINDS, contentHash } from '../../../orchestrators/memory/ports';
import { fromPayload, toPayload } from './collection';

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
});
