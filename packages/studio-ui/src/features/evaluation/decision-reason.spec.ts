import { describe, expect, it } from 'vitest';

import { makeCriteria, makeFinding } from '../../testing/fixtures';
import { findingName, humanizeReason } from './decision-reason';

const CONTRADICTION = makeFinding({
  id: 'contradiction|binding.2,edge.5',
  type: 'contradiction',
  locations: [
    { ref: 'binding.2', label: 'c2 binding (n-3)', part: 'binding', key: 'c2' },
    { ref: 'edge.5', label: 'e-5 · n-2 → n-3 (sync)', part: 'edge', key: 'e-5' },
  ],
});

describe('humanizeReason', () => {
  it('[EVAL-1] names each blocker the controller cites by its record — a finding by its type and places, a criterion by its statement', () => {
    const reason = humanizeReason('blockers to fix: contradiction|binding.2,edge.5, c3', {
      findings: [CONTRADICTION],
      criteria: makeCriteria(),
    });

    expect(reason).toBe(
      'blockers to fix: Contradiction (c2 binding (n-3); e-5 · n-2 → n-3 (sync)), “p99 read latency stays under 200 ms”',
    );
    expect(reason).not.toContain('|');
  });

  it('leaves a sentence that cites nothing it knows exactly as the controller wrote it', () => {
    expect(humanizeReason('below the accept threshold of 75', { criteria: makeCriteria() })).toBe(
      'below the accept threshold of 75',
    );
    expect(humanizeReason('blockers to fix: c9', {})).toBe('blockers to fix: c9');
  });
});

describe('findingName', () => {
  it('reads a finding with no grounded place as its type alone', () => {
    expect(findingName({ ...CONTRADICTION, locations: [] })).toBe('Contradiction');
  });
});
