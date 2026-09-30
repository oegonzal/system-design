import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import { fromRun } from '../../../pipelines/experience-digest/from-run';
import { renderGoal as renderRecord } from '../../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../../pipelines/experience-digest/testing';
import { memoriesToStore } from '../digest/read-digest';
import { ACCEPT_AT, digestInput, readoutTrace } from '../testing';
import { chunksOf } from './chunks';

describe('a stored chunk', () => {
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
