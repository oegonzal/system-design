import type { RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import type { MemoryHit } from '../ports';
import { ACCEPT_AT, acceptedRecall, readoutTrace, recallHits, recallInput } from '../testing';
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
    expect(belowTheBar).toEqual({ admission: 'fell-short', kept: 2, usable: [] });
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
    });
  });
});
