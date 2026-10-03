import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import { fromRun } from '../../../pipelines/knowledge-digest/from-run';
import { renderGoal } from '../../../pipelines/knowledge-digest/input';
import {
  sampleDigest,
  sampleKnown,
  sampleSource,
} from '../../../pipelines/knowledge-digest/testing';
import { sampleRun } from '../../../core/testing';
import { contentHash } from '../../memory/ports';
import { ACCEPT_AT, readoutTrace } from '../../memory/testing';
import { readKnowledgeDigest, type KnownRef } from './read-knowledge-digest';

const KNOWN_TEXT = sampleKnown().text;

const shown = (): KnownRef[] => [
  {
    alias: 'k1',
    point: { runId: sampleKnown().runId, ref: sampleKnown().ref },
    contentHash: contentHash(KNOWN_TEXT),
  },
];

const goal = (): string => {
  const record = fromRun(sampleRun(), sampleSource(), { known: [sampleKnown()] });
  if (record === null) throw new Error('the sample run must compose');
  return renderGoal(record);
};

/** A knowledge-digest run over the digest given, judged against one criterion it passes. */
const digestRun = (
  artifact: unknown,
  overrides: Parameters<typeof readoutTrace>[0] | null = null,
) =>
  readoutTrace({
    pipeline: 'knowledge-digest',
    goal: goal(),
    artifact,
    locations: ['summary', 'memory.1', 'f2', 'r2'],
    criteria: [{ id: 'c1', kind: 'signal', statement: 'accounts for f1 resolving at i2' }],
    results: [
      {
        criterionId: 'c1',
        kind: 'signal',
        result: 'pass',
        hits: 2,
        confidence: 'high',
        locationRefs: ['memory.1'],
      },
    ],
    ...(overrides ?? {}),
  });

describe('what a knowledge digest endorses', () => {
  it('[QL-43] carries the typed half of each item and resolves what it claims about what is known', () => {
    const readout = readKnowledgeDigest(outputsOf(digestRun(sampleDigest())), ACCEPT_AT, shown());
    expect(readout.admission).toBe('admitted');
    expect(readout.proposed).toBe(1);
    expect(readout.unresolved).toBe(0);
    const [item] = readout.memories;
    expect(item).toMatchObject({
      position: 1,
      kind: 'procedure',
      polarity: 'do',
      dimension: 'soundness',
      topics: ['upstream-outage', 'durable-queue'],
    });
    // The evidence aliases are resolved to the engine ids the record listed.
    expect(item.evidence).toEqual([
      { kind: 'finding', ref: 'unhandled_failure|flow.1' },
      { kind: 'criterion', ref: 'c1' },
    ]);
    // The claim is pinned to the point and to the text it was made about.
    expect(item.confirms).toEqual([
      {
        point: { runId: sampleKnown().runId, ref: 'memory.2' },
        contentHash: contentHash(KNOWN_TEXT),
      },
    ]);
    expect(item.contradicts).toEqual([]);
    // An item that confirms what is stored reinforces it rather than being stored again.
    expect(item.storable).toBe(false);
  });

  it('[QL-43] an item that only contradicts is stored, and a claim the recall never handed over is counted', () => {
    const digest = sampleDigest({
      memories: [{ ...sampleDigest().memories[0], confirms: [], contradicts: ['k1'] }],
    });
    const stored = readKnowledgeDigest(outputsOf(digestRun(digest)), ACCEPT_AT, shown());
    expect(stored.memories[0].storable).toBe(true);
    expect(stored.memories[0].contradicts).toHaveLength(1);
    expect(stored.unresolved).toBe(0);

    // The references validator refuses an invented alias, so reaching here means
    // the recall's own list no longer holds it — counted, never guessed at.
    const dangling = readKnowledgeDigest(outputsOf(digestRun(sampleDigest())), ACCEPT_AT, []);
    expect(dangling.unresolved).toBe(1);
    expect(dangling.memories[0].confirms).toEqual([]);
    expect(dangling.memories[0].storable).toBe(true);
  });

  it('[QL-43] a digest a confirmed finding faults endorses nothing of that item, and one never judged says so', () => {
    const faulted = digestRun(sampleDigest(), {
      pipeline: 'knowledge-digest',
      goal: goal(),
      artifact: sampleDigest(),
      locations: ['summary', 'memory.1', 'f2', 'r2'],
      criteria: [{ id: 'c1', kind: 'signal', statement: 'accounts for f1 resolving at i2' }],
      results: [
        {
          criterionId: 'c1',
          kind: 'signal',
          result: 'pass',
          hits: 2,
          confidence: 'high',
          locationRefs: ['memory.1'],
        },
      ],
      findings: [
        {
          key: 'misattributed_evidence|memory.1',
          type: 'misattributed_evidence',
          severity: 'high',
          confidence: 'high',
          fixability: 'fixable_local',
          locationRefs: ['memory.1'],
          criterionIds: [],
          hits: 2,
          lenses: ['critic.grounding'],
          rationale: null,
          reconciledTo: null,
        },
      ],
    });
    const readout = readKnowledgeDigest(outputsOf(faulted), ACCEPT_AT, shown());
    expect(readout.admission).toBe('admitted');
    expect(readout.proposed).toBe(1);
    expect(readout.memories).toEqual([]);

    // No rubric is not a verdict on what the digest would have taught.
    const unjudged = readKnowledgeDigest(
      outputsOf(
        readoutTrace({
          pipeline: 'knowledge-digest',
          goal: goal(),
          artifact: sampleDigest(),
          locations: ['summary'],
          criteria: [],
          decision: 'escalate',
          overall: 0,
        }),
      ),
      ACCEPT_AT,
      shown(),
    );
    expect(unjudged.admission).toBe('no-rubric');
    expect(unjudged.memories).toEqual([]);
    expect(unjudged.unresolved).toBe(0);
  });
});
