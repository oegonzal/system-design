import type { RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import type { MemoryHit } from '../ports';
import { samplePack } from '../../../pipelines/memory-recall/testing';
import {
  ACCEPT_AT,
  acceptedRecall,
  faulting,
  passed,
  readoutTrace,
  recallHits,
  recallInput,
} from '../testing';
import { readPack as packOf } from './read-pack';

// The reader takes a run's outputs; these specs build traces, so read through the view.
const readPack = (trace: RunTrace, hits: readonly MemoryHit[], acceptAt: number) =>
  packOf(outputsOf(trace), hits, acceptAt);

const hits = recallHits();

describe('reading a recall', () => {
  it('[QL-16] an accepted pack endorses kept chunks no finding names, strongest support first; anything else endorses nothing', () => {
    const { kept, usable } = readPack(acceptedRecall(), hits, ACCEPT_AT);
    expect(kept).toBe(2);
    expect(usable.map((item) => [item.alias, item.support])).toEqual([['m1', 1]]);
    expect(usable[0].hit.source.runId).toBe('run-a');

    const belowTheBar = readPack(
      readoutTrace({ ...recallInput(), decision: 'revise', overall: 50 }),
      hits,
      ACCEPT_AT,
    );
    expect(belowTheBar).toEqual({ admission: 'fell-short', kept: 2, usable: [], withheld: [] });
  });

  it('[QL-16] a pack that cleared the bar is drawn on even though the loop ran out of iterations', () => {
    // What a real recall looks like: scored past the bar, still `revise`
    // because a blocker somewhere in the pack never closed inside two passes.
    const outOfIterations = readoutTrace({
      ...recallInput(),
      decision: 'revise',
      overall: 82,
      policyAllowed: false,
    });

    const readout = readPack(outOfIterations, hits, ACCEPT_AT);

    expect(readout.admission).toBe('admitted');
    // m2 is the one a finding names, and it is the only one withheld.
    expect(readout.usable.map((item) => item.alias)).toEqual(['m1']);
    expect(readout.withheld).toEqual([
      { ref: 'm2', source: 'finding', by: 'irrelevant_chunk', note: null },
    ]);
  });

  it('[QL-53] a redundant set and a gap that names a kept chunk each withhold nothing', () => {
    // The recorded drops this fixes: every confirmed redundant pair lost both
    // halves, leaving the defects each served with no lesson at all. A
    // confirmed redundant set may hold a bystander, so every member stands.
    const redundant = readoutTrace({
      ...recallInput(),
      results: [passed('c1', 'need', ['m2'])],
      findings: [faulting('redundant_chunk', ['m1', 'm2']), faulting('missed_chunk', ['m1', 'm3'])],
    });

    const readout = readPack(redundant, hits, ACCEPT_AT);
    expect(readout.usable.map((item) => item.alias)).toEqual(['m2', 'm1']);
    expect(readout.withheld).toEqual([]);
    // Every usable memory carries the rubric its curator's words cite needs by.
    expect(readout.usable[0].rubric).toEqual(redundant.contract.criteria);
  });

  it('[QL-16] a pack whose validators failed is withheld whole, however well it scored', () => {
    const broken = readoutTrace({
      ...recallInput(),
      decision: 'revise',
      overall: 99,
      validatorsPassed: false,
    });

    expect(readPack(broken, hits, ACCEPT_AT)).toEqual({
      admission: 'fell-short',
      kept: 2,
      usable: [],
      withheld: [],
    });
  });

  it('[QL-16] a pack curated against no rubric endorses nothing, and says it was never judged', () => {
    const unjudged = readoutTrace({
      ...recallInput(),
      decision: 'escalate',
      overall: 0,
      criteria: [],
      results: [],
      findings: [],
    });

    expect(readPack(unjudged, hits, ACCEPT_AT)).toEqual({
      admission: 'no-rubric',
      kept: 2,
      usable: [],
      withheld: [],
    });
  });

  it('[QL-50] a kept chunk confirmed as only restating what the producer holds is withheld like any faulted one', () => {
    const restated = readoutTrace({
      ...recallInput(),
      results: [passed('c1', 'need', ['m1', 'm2'])],
      findings: [faulting('restated_defect', ['m1'])],
    });

    expect(readPack(restated, hits, ACCEPT_AT).usable.map((item) => item.alias)).toEqual(['m2']);
  });

  it('[QL-16] a pack the seam kept past a ceiling is drawn on whole, never withheld for its size', () => {
    const [first, second] = samplePack().kept;
    const wordy = {
      ...first,
      insight: 'a read path with one store behind it fell over. '.repeat(20),
    };
    const overlong = readoutTrace({
      ...recallInput(),
      artifact: samplePack({ kept: [wordy, second] }),
      findings: [],
    });

    const readout = readPack(overlong, hits, ACCEPT_AT);
    expect(readout.admission).toBe('admitted');
    expect(readout.usable.map((item) => item.kept.insight)).toContain(wordy.insight);
  });
});
