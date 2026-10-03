import { describe, expect, it } from 'vitest';

import { sampleIterations, sampleRun } from '../../../core/testing';
import { KNOWLEDGE_ITEM_KINDS } from '@sysdesign/contracts';
import { VECTOR_NAMES } from '../../memory/ports';
import { KNOWN_PER_PROBE, MAX_KNOWN_PROBES, knownFilter, knownProbes, probesOf } from './probes';

const traceOf = () => {
  const run = sampleRun();
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

describe('what the store is asked about a finished run', () => {
  it('[QL-43] asks with the run’s own evidence, defects worst-first and then the conditions', () => {
    const lines = knownProbes(traceOf());
    // The judged iteration is i2, whose ledger holds the one finding that
    // persisted and both criteria. Its own critics said nothing again, so the
    // defect is asked about by what the engine recorded there — its type and
    // severity — exactly as a focused recall asks about it.
    expect(lines).toEqual([
      'contradiction (medium)',
      'pass: List orders newest first.',
      'pass: The POS is polled, never called per request.',
    ]);
  });

  it('[QL-43] a shortfall is asked about before a pass, and the worst defect before the rest', () => {
    const trace = traceOf();
    const [first] = sampleIterations();
    // i1 has two findings — high and medium — and one partial criterion.
    const lines = knownProbes({ ...trace, iterations: [first], bestIteration: 1 });
    expect(lines[0]).toContain('unhandled failure (high)');
    expect(lines[1]).toContain('contradiction (medium)');
    expect(lines[2]).toBe('partial: List orders newest first.');
    expect(lines[3]).toBe('pass: The POS is polled, never called per request.');
  });

  it('[QL-43] repeats are asked once, nothing is asked of a run with no evidence, and the count is bounded', () => {
    const trace = traceOf();
    const [first] = sampleIterations();
    const bare = {
      ...first,
      ledger: { ...first.ledger, findings: [], criteria: [] },
    };
    expect(knownProbes({ ...trace, iterations: [bare], bestIteration: 1 })).toEqual([]);

    const many = {
      ...first,
      ledger: {
        ...first.ledger,
        criteria: Array.from({ length: MAX_KNOWN_PROBES + 6 }, (_, index) => ({
          ...first.ledger.criteria[0],
          criterionId: `c${index + 1}`,
        })),
        findings: [first.ledger.findings[0], first.ledger.findings[0]],
      },
    };
    const lines = knownProbes({ ...trace, iterations: [many], bestIteration: 1 });
    expect(lines).toHaveLength(MAX_KNOWN_PROBES);
    // The repeated finding is asked once, and an unknown criterion id stands in
    // for its own statement rather than being dropped.
    expect(lines.filter((line) => line.startsWith('unhandled failure'))).toHaveLength(1);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('[QL-43] the search reads knowledge and lessons, never the run’s own points', () => {
    const filter = knownFilter('run-a');
    expect(filter.kinds).toEqual([...KNOWLEDGE_ITEM_KINDS, 'lesson']);
    expect(filter.notRunIds).toEqual(['run-a']);
    // Episodic precedent is left out: a finding chunk is what was seen, not a
    // claim a digest should write a delta against.
    expect(filter.kinds).not.toContain('finding');

    const probes = probesOf(
      [
        [1, 0],
        [0, 1],
      ],
      filter,
    );
    expect(probes).toHaveLength(2 * VECTOR_NAMES.length);
    expect(probes.map((probe) => probe.using)).toEqual([...VECTOR_NAMES, ...VECTOR_NAMES]);
    expect(probes.every((probe) => probe.limit === KNOWN_PER_PROBE)).toBe(true);
    expect(probes.every((probe) => probe.filter === filter)).toBe(true);
  });
});
