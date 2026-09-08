import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES } from '../../core/prompting';
import { fromRun } from '../../pipelines/experience-digest/compose';
import { renderGoal as renderRecord } from '../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../pipelines/experience-digest/testing';
import { renderGoal as renderQuery } from '../../pipelines/memory-recall/input';
import { samplePack } from '../../pipelines/memory-recall/testing';
import {
  bareGoal,
  buildQuery,
  chunksOf,
  fuse,
  MEMORY_HEADING,
  memoriesToStore,
  queryText,
  readPack,
  withMemory,
} from './compose';
import { confirmed, fused, GOAL, hitOf, passed, traceOf } from './testing';

/** Both memory pipelines set the same bar; the specs state it rather than import it. */
const ACCEPT_AT = 75;

const hits = [
  hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
  hitOf('record each status transition as a row', 'run-a', 'memory.2'),
  hitOf('dedupe notifications by event id', 'run-b', 'memory.1'),
];

describe('composing a memory run', () => {
  it('[QL-16] the recall query is the goal head under the byte cap, and a maximal query still renders under the goal budget', () => {
    const long = 'x'.repeat(70_000);
    expect(Buffer.byteLength(queryText(long))).toBeLessThanOrEqual(16_000);
    const wide = Array.from({ length: 17 }, (_, index) =>
      hitOf('y'.repeat(1_200), `run-${index}`, 'memory.1'),
    );
    const query = buildQuery(queryText(long), [queryText(long)], fused(wide));
    expect(query.candidates).toHaveLength(16);
    expect(() => renderQuery(query)).not.toThrow();
  });

  it('[QL-16] the bare goal is the goal without the section a memory run appended', () => {
    const composed = withMemory(GOAL, readPack(acceptedRecall(), hits, ACCEPT_AT).usable);
    expect(composed).not.toBeNull();
    expect(bareGoal(composed?.goal ?? '')).toBe(GOAL);
    expect(bareGoal(GOAL)).toBe(GOAL);
  });

  it('[QL-16] an accepted pack endorses kept chunks no finding names, strongest support first; anything else endorses nothing', () => {
    const { kept, usable } = readPack(acceptedRecall(), hits, ACCEPT_AT);
    expect(kept).toBe(2);
    expect(usable.map((item) => [item.alias, item.support])).toEqual([['m1', 1]]);
    expect(usable[0].hit.source.runId).toBe('run-a');

    const belowTheBar = readPack(
      traceOf({ ...recallInput(), decision: 'revise', overall: 50 }),
      hits,
      ACCEPT_AT,
    );
    expect(belowTheBar).toEqual({ admitted: false, kept: 2, usable: [] });
  });

  it('[QL-16] a pack that cleared the bar is drawn on even though the loop ran out of iterations', () => {
    // What a real recall looks like: scored past the bar, still `revise`
    // because a blocker somewhere in the pack never closed inside two passes.
    const outOfIterations = traceOf({
      ...recallInput(),
      decision: 'revise',
      overall: 82,
      policyAllowed: false,
    });

    const readout = readPack(outOfIterations, hits, ACCEPT_AT);

    expect(readout.admitted).toBe(true);
    // m2 is the one a finding names, and it is the only one withheld.
    expect(readout.usable.map((item) => item.alias)).toEqual(['m1']);
  });

  it('[QL-16] a pack whose validators failed is withheld whole, however well it scored', () => {
    const broken = traceOf({
      ...recallInput(),
      decision: 'revise',
      overall: 99,
      validatorsPassed: false,
    });

    expect(readPack(broken, hits, ACCEPT_AT)).toEqual({ admitted: false, kept: 2, usable: [] });
  });

  it("[QL-16] fusion rewards the chunk several probes agree on over one probe's favourite", () => {
    const agreed = hitOf('agreed by two probes', 'run-a', 'memory.1');
    const favourite = hitOf("one probe's top hit", 'run-b', 'memory.1');
    const other = hitOf('also seen once', 'run-c', 'memory.1');

    // `favourite` is rank 0 of the first list and scores highest; `agreed` is
    // rank 1 of both. Rank-based fusion prefers the one both probes ranked.
    const fused = fuse(
      [
        [
          { ...favourite, score: 0.9 },
          { ...agreed, score: 0.3 },
        ],
        [
          { ...other, score: 0.4 },
          { ...agreed, score: 0.35 },
        ],
      ],
      3,
    );

    expect(fused[0].text).toBe(agreed.text);
    // A chunk carried by two lists keeps its best-scoring copy.
    expect(fused[0].score).toBe(0.35);
    expect(fused).toHaveLength(3);
  });

  it('[QL-16] strongest support first, and the least supported are dropped first when the budget is short', () => {
    const pack = samplePack({
      kept: [
        { chunk: 'm1', serves: 'one', insight: 'a', caveat: null },
        { chunk: 'm2', serves: 'two', insight: 'b', caveat: null },
        { chunk: 'm3', serves: 'three', insight: 'c', caveat: null },
      ],
      dropped: [],
    });
    const trace = traceOf({
      pipeline: 'memory-recall',
      goal: renderQuery(buildQuery(GOAL, [GOAL], fused(hits))),
      artifact: pack,
      locations: ['summary', 'm1', 'm2', 'm3', 'gap.1'],
      criteria: [
        { id: 'c1', kind: 'need', statement: 'one' },
        { id: 'c2', kind: 'need', statement: 'two' },
        { id: 'c3', kind: 'need', statement: 'three' },
      ],
      results: [
        passed('c1', 'need', ['m3']),
        passed('c2', 'need', ['m3']),
        passed('c3', 'need', ['m1']),
      ],
    });
    const { usable } = readPack(trace, hits, ACCEPT_AT);
    expect(usable.map((item) => [item.alias, item.support])).toEqual([
      ['m3', 2],
      ['m1', 1],
      ['m2', 0],
    ]);
    const all = withMemory(GOAL, usable);
    expect(all?.injected).toBe(3);
    const twoFit = Buffer.byteLength(all?.goal ?? '') - 10;
    const fewer = withMemory(GOAL, usable, twoFit);
    expect(fewer?.injected).toBe(2);
    expect(fewer?.goal).toContain('[m3]');
    expect(fewer?.goal).toContain('[m1]');
    expect(fewer?.goal).not.toContain('[m2]');
  });

  it('[QL-16] memory reaches the goal as an advisory section that fits the budget, or not at all', () => {
    const { usable } = readPack(acceptedRecall(), hits, ACCEPT_AT);
    const composed = withMemory(GOAL, usable);
    expect(composed?.injected).toBe(1);
    expect(composed?.goal.startsWith(GOAL)).toBe(true);
    expect(composed?.goal).toContain(MEMORY_HEADING);
    expect(composed?.goal).toContain(
      '- [m1] lesson · run run-a · system-design · iteration 1 · decided accept · 2026-09-06 · ref memory.1: serve the list from a store the page owns — serves: availability of the list read; insight: a read path with a single store behind it went down with the POS',
    );

    const tight = GOAL_MAX_BYTES - Buffer.byteLength(GOAL) - 10;
    expect(withMemory(GOAL, usable, Buffer.byteLength(GOAL) + tight)).not.toBeNull();
    expect(withMemory(GOAL, usable, Buffer.byteLength(GOAL))).toBeNull();
    expect(withMemory(GOAL, [])).toBeNull();
  });

  it('[QL-16] an accepted digest endorses memories no finding names, with evidence resolved through its own index', () => {
    const record = fromRun(sampleRun());
    if (record === null) throw new Error('the sample run must compose');
    const goal = renderRecord(record);
    const digest = sampleDigest({
      memories: [
        ...sampleDigest().memories,
        {
          evidence: ['f2'],
          insight: 'Name the fix for a contradiction or escalate it.',
          appliesWhen: 'a critic finds two parts that cannot both hold',
        },
      ],
      unused: ['r2'],
    });
    const trace = traceOf({
      pipeline: 'experience-digest',
      goal,
      artifact: digest,
      locations: ['summary', 'memory.1', 'memory.2', 'f1', 'r1', 'f2', 'r2'],
      findings: [confirmed('run_specific', ['memory.2'])],
    });
    expect(memoriesToStore(trace, ACCEPT_AT)).toEqual({
      admitted: true,
      proposed: 2,
      memories: [
        {
          position: 1,
          insight: digest.memories[0].insight,
          appliesWhen: digest.memories[0].appliesWhen,
          evidence: [
            { kind: 'finding', ref: 'unhandled_failure|flow.1' },
            { kind: 'criterion', ref: 'c1' },
          ],
        },
      ],
    });
    const belowTheBar = traceOf({ ...digestInput(digest, goal), decision: 'revise', overall: 50 });
    expect(memoriesToStore(belowTheBar, ACCEPT_AT)).toEqual({
      admitted: false,
      proposed: 2,
      memories: [],
    });
  });

  it('[QL-16] a blocker on the summary withholds the summary, not the memories under it', () => {
    // The live failure this rule exists for: a digest scored 94, ended
    // `revise` on an open `misattributed_evidence` naming only the summary,
    // and eight clean memories were thrown away with it.
    const record = fromRun(sampleRun());
    if (record === null) throw new Error('the sample run must compose');
    const digest = sampleDigest();
    const faultedSummary = traceOf({
      ...digestInput(digest, renderRecord(record)),
      decision: 'revise',
      overall: 94,
      policyAllowed: false,
      findings: [confirmed('misattributed_evidence', ['summary'])],
    });

    const readout = memoriesToStore(faultedSummary, ACCEPT_AT);

    expect(readout.admitted).toBe(true);
    expect(readout.memories.map((memory) => memory.position)).toEqual([1]);
  });

  it('[QL-16] a stored chunk is a lesson addressed by the digest location, carrying the source run as provenance', () => {
    const { memories } = memoriesToStore(
      traceOf({
        pipeline: 'experience-digest',
        goal: renderRecord(
          fromRun(sampleRun()) ??
            (() => {
              throw new Error('compose');
            })(),
        ),
        artifact: sampleDigest(),
        locations: ['summary', 'memory.1', 'f1', 'r1', 'f2', 'r2'],
      }),
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

function recallInput() {
  const pack = samplePack();
  return {
    pipeline: 'memory-recall',
    goal: renderQuery(buildQuery(GOAL, [GOAL], fused(hits))),
    artifact: pack,
    locations: ['summary', 'm1', 'm2', 'm3', 'gap.1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'serve a list from an unreliable upstream' }],
    results: [passed('c1', 'need', ['m1'])],
    findings: [confirmed('irrelevant_chunk', ['m2'])],
  };
}

const acceptedRecall = () => traceOf(recallInput());

function digestInput(digest: ReturnType<typeof sampleDigest>, goal: string) {
  return {
    pipeline: 'experience-digest',
    goal,
    artifact: digest,
    locations: ['summary', 'memory.1', 'memory.2', 'f1', 'r1', 'f2', 'r2'],
  };
}
