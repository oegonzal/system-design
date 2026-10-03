import type { AdoptedIterationRef } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { hitOf } from '../testing';
import type { RecallKnown } from './known';
import { EXCLUSION_POLICY, noveltyOf, originOf, screen } from './novelty';
import type { FusedHit } from './query';

const PIPELINE = 'system-design-canvas';
const PROMPT = 'prompt-hash';
const HELD = ['unhandled_failure|node.3', 'missing_requirement|brief'];

/** A coach adopted `coach@2`, whose run had adopted the grade's only iteration. */
const KNOWN: RecallKnown = {
  pipeline: PIPELINE,
  goalHash: PROMPT,
  chain: [
    { runId: 'coach', iteration: 2 },
    { runId: 'grade', iteration: 1 },
  ],
  findings: new Set(HELD),
  criteria: new Map([['c1', 'fail']]),
  remediations: [],
};

interface LessonOf {
  pipeline?: string;
  iteration?: number;
  findings?: string[];
  criteria?: string[];
  /** The iteration its evidence was judged in, and its prompt; null for a point stored before lineage. */
  judged?: AdoptedIterationRef | null;
  goalHash?: string;
  probes?: number[];
}

/** A stored lesson of `runId` as fusion hands it on. */
const lesson = (text: string, runId: string, of: LessonOf = {}): FusedHit => {
  const hit = hitOf(text, runId, 'memory.1');
  const judged = of.judged === undefined ? { runId, iteration: of.iteration ?? 1 } : of.judged;
  return {
    ...hit,
    source: { ...hit.source, pipeline: of.pipeline ?? PIPELINE, iteration: of.iteration ?? 1 },
    evidence: [
      ...(of.findings ?? []).map((ref) => ({ kind: 'finding' as const, ref })),
      ...(of.criteria ?? []).map((ref) => ({ kind: 'criterion' as const, ref })),
    ],
    lineage:
      judged === null
        ? null
        : { judged, adoptedFrom: null, goalHash: of.goalHash ?? 'another-prompt' },
    probes: of.probes ?? [0],
  };
};

const offeredText = (pool: FusedHit[], limit = 16) =>
  screen(pool, KNOWN, limit).offered.map((hit) => hit.text);

describe('the screen a recall for a revising producer runs', () => {
  it('[QL-51] sets aside a lesson of the chain up to the iteration held, and keeps a later one as chain', () => {
    const held = lesson('the grade’s own lesson', 'grade', { iteration: 1 });
    const adopted = lesson('the coach’s lesson of what it adopted', 'coach', { iteration: 2 });
    const later = lesson('the coach’s lesson of a later revision', 'coach', { iteration: 3 });

    const screened = screen([held, adopted, later], KNOWN, 16);
    expect(screened.offered.map((hit) => [hit.text, hit.origin])).toEqual([
      ['the coach’s lesson of a later revision', 'chain'],
    ]);
    expect(screened.excluded).toEqual([
      {
        sourceRunId: 'grade',
        ref: 'memory.1',
        iteration: 1,
        reason: 'chain-iteration',
        matched: ['grade@1'],
      },
      {
        sourceRunId: 'coach',
        ref: 'memory.1',
        iteration: 2,
        reason: 'chain-iteration',
        matched: ['coach@2'],
      },
    ]);
  });

  it('[QL-51] sets aside a sibling’s copy — its evidence judged in exactly a link of the chain — whatever it cites', () => {
    const copy = lesson('a sibling restating the adopted ledger', 'sibling', {
      judged: { runId: 'coach', iteration: 2 },
      findings: ['scale_mismatch|node.9'],
    });
    const own = lesson('a sibling’s own revision', 'sibling', {
      judged: { runId: 'sibling', iteration: 3 },
      iteration: 3,
      goalHash: PROMPT,
      findings: ['scale_mismatch|node.9'],
    });
    const screened = screen([copy, own], KNOWN, 16);
    expect(screened.excluded.map((item) => [item.reason, item.matched])).toEqual([
      ['sibling-copy', ['coach@2']],
    ]);
    expect(screened.offered.map((hit) => [hit.text, hit.origin])).toEqual([
      ['a sibling’s own revision', 'same-prompt'],
    ]);
  });

  it('[QL-51] sets aside a lesson of the same prompt resting only on held findings — a legacy point by pipeline alone — and keeps one that adds a finding', () => {
    const restated = lesson('restates both held defects', 'cousin', {
      goalHash: PROMPT,
      findings: HELD,
    });
    const legacy = lesson('a point stored before lineage', 'old', {
      judged: null,
      findings: [HELD[0]],
    });
    const adds = lesson('adds a defect the producer lacks', 'cousin2', {
      goalHash: PROMPT,
      findings: [HELD[0], 'scale_mismatch|node.9'],
    });
    const rubricOnly = lesson('cites a criterion only', 'cousin3', {
      goalHash: PROMPT,
      criteria: ['c1'],
    });
    const elsewhere = lesson('another prompt, the same keys', 'stranger', { findings: HELD });
    const otherPipeline = lesson('another pipeline, the same keys', 'far', {
      pipeline: 'system-design',
      judged: null,
      findings: HELD,
    });

    const screened = screen(
      [restated, legacy, adds, rubricOnly, elsewhere, otherPipeline],
      KNOWN,
      16,
    );
    expect(screened.excluded.map((item) => [item.sourceRunId, item.reason, item.matched])).toEqual([
      ['cousin', 'known-evidence', HELD],
      ['old', 'known-evidence', [HELD[0]]],
    ]);
    // Keys are local to a ledger: on another prompt, or another pipeline, a match is coincidence.
    expect(screened.offered.map((hit) => [hit.source.runId, hit.origin])).toEqual([
      ['cousin2', 'same-prompt'],
      ['cousin3', 'same-prompt'],
      ['stranger', 'same-pipeline'],
      ['far', 'other-pipeline'],
    ]);
  });

  it('[QL-51] the first rule that matches is the one recorded', () => {
    const both = lesson('a chain lesson that also rests on held findings', 'grade', {
      iteration: 1,
      goalHash: PROMPT,
      findings: HELD,
    });
    expect(screen([both], KNOWN, 16).excluded.map((item) => item.reason)).toEqual([
      'chain-iteration',
    ]);
  });

  it('[QL-51] twins another run digested from the same evidence of the same prompt take one slot, keeping the best and every probe', () => {
    const original = lesson('the original digest’s lesson', 'cousin', {
      goalHash: PROMPT,
      findings: ['scale_mismatch|node.9'],
      probes: [0, 2],
    });
    const twin = lesson('a copy’s digest, worded otherwise', 'cousin-copy', {
      goalHash: PROMPT,
      findings: ['scale_mismatch|node.9'],
      probes: [1],
    });
    const sameRun = lesson('a second lesson of the original digest', 'cousin', {
      goalHash: PROMPT,
      findings: ['scale_mismatch|node.9'],
    });
    const legacy = lesson('a legacy point citing the same', 'old', {
      judged: null,
      findings: ['scale_mismatch|node.9'],
    });

    const screened = screen([original, twin, sameRun, legacy], KNOWN, 16);
    expect(screened.collapsed).toBe(1);
    expect(screened.offered.map((hit) => [hit.text, hit.probes])).toEqual([
      ['the original digest’s lesson', [0, 1, 2]],
      ['a second lesson of the original digest', [0]],
      ['a legacy point citing the same', [0]],
    ]);
  });

  it('[QL-51] offers at most the limit, in fused order; a demoting policy ranks a match last rather than setting it aside', () => {
    const fresh = Array.from({ length: 5 }, (_, index) =>
      lesson(`fresh ${index}`, `run-${index}`, { pipeline: 'system-design' }),
    );
    const held = lesson('the grade’s own lesson', 'grade');
    expect(offeredText([held, ...fresh], 3)).toEqual(['fresh 0', 'fresh 1', 'fresh 2']);

    const demoting = { ...EXCLUSION_POLICY, 'chain-iteration': 'demote' } as const;
    const demoted = screen([held, ...fresh], KNOWN, 16, demoting);
    expect(demoted.offered.map((hit) => hit.text)).toEqual([
      ...fresh.map((hit) => hit.text),
      'the grade’s own lesson',
    ]);
    expect(demoted.excluded).toEqual([]);
    expect(demoted.demoted.map((item) => item.reason)).toEqual(['chain-iteration']);
  });

  it('[QL-51] records the chain, what was held and what became of the pool, with each offered lesson’s origin by alias', () => {
    const pool = [
      lesson('the grade’s own lesson', 'grade'),
      lesson('a later revision', 'coach', { iteration: 3 }),
      lesson('another pipeline', 'far', { pipeline: 'system-design' }),
    ];
    const novelty = noveltyOf(
      { ...KNOWN, remediations: [{ subject: 's', severity: 'high', note: 'n' }] },
      pool.length,
      screen(pool, KNOWN, 16),
    );
    expect(novelty).toMatchObject({
      chain: KNOWN.chain,
      known: { findings: 2, criteria: 1, remediations: 1 },
      pool: 3,
      collapsed: 0,
      offered: 2,
      demoted: [],
      origins: [
        { ref: 'm1', sourceRunId: 'coach', origin: 'chain' },
        { ref: 'm2', sourceRunId: 'far', origin: 'other-pipeline' },
      ],
    });
    expect(novelty.excluded.map((item) => item.sourceRunId)).toEqual(['grade']);
    expect(originOf(pool[0], KNOWN)).toBe('chain');
  });
});
