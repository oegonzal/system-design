import { describe, expect, it } from 'vitest';

import { makeCriteria, makeFinding } from '../../testing/fixtures';
import { decisionInWords, findingName, humanizeReason } from './decision-reason';

const CONTRADICTION = makeFinding({
  id: 'contradiction|binding.2,edge.5',
  type: 'contradiction',
  locations: [
    { ref: 'binding.2', label: 'c2 binding (n-3)', part: 'binding', key: 'c2' },
    { ref: 'edge.5', label: 'e-5 · n-2 → n-3 (sync)', part: 'edge', key: 'e-5' },
  ],
  locationRefs: ['binding.2', 'edge.5'],
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

  it('[EVAL-2] rewrites an id only as a whole token, and never re-reads a name it put in place', () => {
    expect(
      humanizeReason('blockers to fix: contradiction|binding.2,edge.5, c4, c41', {
        findings: [CONTRADICTION],
        criteria: [{ id: 'c4', kind: 'functional', statement: 'A c4 order survives a restart' }],
      }),
    ).toBe(
      'blockers to fix: Contradiction (c2 binding (n-3); e-5 · n-2 → n-3 (sync)), “A c4 order survives a restart”, c41',
    );
  });
});

describe('findingName', () => {
  it('reads a finding with no grounded place as its type alone', () => {
    expect(findingName({ ...CONTRADICTION, locations: [] })).toBe('Contradiction');
  });

  it('[EVAL-2] names a finding by the places its lens cited, not by a place its rationale merely mentions', () => {
    const mentioned = {
      ref: 'node.3',
      label: 'n-3 · database · Orders DB',
      part: 'node',
      key: 'n-3',
      name: 'Orders DB',
    } as const;
    expect(findingName(makeFinding({ ...CONTRADICTION, mentions: [mentioned] }))).toBe(
      'Contradiction (c2 binding (n-3); e-5 · n-2 → n-3 (sync))',
    );
  });
});

describe('decisionInWords', () => {
  const basis = (factor: string | null, remediations: number, assessed = 5, total = 5) => ({
    factor,
    remediations,
    criteria: { assessed, total },
  });

  it('[DEL-8] words the route’s decision from what it selected — never "N remediation(s) to apply"', () => {
    const say = (remediations: number, decision: 'revise' | 'retry' | 'escalate') =>
      decisionInWords(
        {
          decision,
          reason: `${remediations} remediation(s) to apply`,
          basis: basis('route', remediations),
        },
        {},
      );
    expect(say(10, 'revise')).toBe('Below the accept threshold — 10 fixes to make.');
    expect(say(1, 'revise')).toBe('Below the accept threshold — 1 fix to make.');
    expect(say(3, 'retry')).toBe(
      'Below the accept threshold — 3 fixes, each calling for a fresh attempt.',
    );
    expect(say(0, 'escalate')).toBe(
      'Below the accept threshold, with no fix the lenses could point to — it needs a person’s judgement.',
    );
    expect(say(10, 'revise')).not.toContain('(s)');
  });

  it('[DEL-8] words the evidence gate’s decision from the criteria assessed of how many', () => {
    expect(
      decisionInWords(
        {
          decision: 'escalate',
          reason: 'only 20% of criteria assessed; unassessed: c2, c3, c4, c5',
          basis: basis('evidence', 0, 1, 5),
        },
        {},
      ),
    ).toBe('Not scored — the lenses assessed 1 of 5 criteria, too few for a verdict.');
  });

  it('[DEL-8] reads a step it has no words for as the controller’s sentence, every id it cites named', () => {
    expect(
      decisionInWords(
        {
          decision: 'revise',
          reason: 'blockers to fix: contradiction|binding.2,edge.5, c3',
          basis: basis('policy-allowed', 2),
        },
        { findings: [CONTRADICTION], criteria: makeCriteria() },
      ),
    ).toBe(
      'blockers to fix: Contradiction (c2 binding (n-3); e-5 · n-2 → n-3 (sync)), “p99 read latency stays under 200 ms”',
    );
    // A trace with no deciding step, or a gate a pipeline composed of its own: the sentence stands.
    expect(
      decisionInWords(
        { decision: 'accept', reason: 'stub: 3 nodes → 64', basis: basis(null, 0) },
        {},
      ),
    ).toBe('stub: 3 nodes → 64');
    expect(
      decisionInWords(
        {
          decision: 'revise',
          reason: 'below the floor 60: coverage 55',
          basis: basis('dimension-floor', 1),
        },
        {},
      ),
    ).toBe('below the floor 60: coverage 55');
  });

  it('says nothing for a grade with no decision to word', () => {
    expect(decisionInWords({ decision: null, reason: null, basis: null }, {})).toBeNull();
  });
});
