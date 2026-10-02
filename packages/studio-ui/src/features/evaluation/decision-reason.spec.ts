import type { DecisionFacts } from '@sysdesign/contracts';
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
  const basis = (
    factor: string | null,
    remediations: number,
    assessed = 5,
    total = 5,
    facts: DecisionFacts = {},
  ) => ({
    factor,
    facts,
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

  it('[DEL-8] words a score held to the reject floor from the floor itself — never "overall 25 below the floor 30 (revised, never restarted)"', () => {
    const say = (decision: 'revise' | 'retry', facts: DecisionFacts) =>
      decisionInWords(
        {
          decision,
          reason: 'overall 25 below the floor 30 (revised, never restarted)',
          basis: basis('reject-floor', 4, 5, 5, facts),
        },
        {},
      );
    expect(say('revise', { overall: 25, floor: 30 })).toBe(
      'Below the reject floor of 30 — far enough off to need reworking, not touching up.',
    );
    expect(say('retry', { overall: 25, floor: 30 })).toBe(
      'Below the reject floor of 30 — too far off to revise, so a fresh attempt is called for.',
    );
    expect(say('revise', { overall: 25, floor: 30 })).not.toContain('overall');
  });

  it('[DEL-8] words an accept from the threshold it cleared', () => {
    expect(
      decisionInWords(
        {
          decision: 'accept',
          reason: 'overall 82.4 ≥ 75',
          basis: basis('accept-threshold', 0, 5, 5, { overall: 82.4, acceptAt: 75 }),
        },
        {},
      ),
    ).toBe('At or above the accept threshold of 75, with nothing blocking it.');
  });

  it('[DEL-8] words a blocker’s decision from the blockers it named, each by its record, and what the decision asks for', () => {
    const blocked = (decision: 'revise' | 'escalate' | 'reject' | 'retry', reason: string) =>
      decisionInWords(
        {
          decision,
          reason,
          basis: basis('policy-allowed', 2, 5, 5, {
            findings: ['contradiction|binding.2,edge.5'],
            criteria: ['c3'],
          }),
        },
        { findings: [CONTRADICTION], criteria: makeCriteria() },
      );
    const named =
      'Contradiction (c2 binding (n-3); e-5 · n-2 → n-3 (sync)) and “p99 read latency stays under 200 ms”';
    expect(blocked('revise', 'blockers to fix: contradiction|binding.2,edge.5, c3')).toBe(
      `Blocked by ${named} — to fix before it can be accepted.`,
    );
    expect(
      blocked('revise', 'blockers require a fresh attempt: x (revised, never restarted)'),
    ).toBe(`Blocked by ${named} — to fix before it can be accepted.`);
    expect(blocked('escalate', 'a blocker needs a person: x')).toBe(
      `Blocked by ${named} — it needs a person’s judgement.`,
    );
    expect(blocked('reject', 'unfixable blocker: x')).toBe(
      `Blocked by ${named} — no revision can fix that, so it is rejected.`,
    );
    // A blocker the reader has no record of keeps its id.
    expect(
      decisionInWords(
        {
          decision: 'revise',
          reason: 'blockers to fix: c9',
          basis: basis('policy-allowed', 1, 5, 5, { findings: [], criteria: ['c9'] }),
        },
        {},
      ),
    ).toBe('Blocked by c9 — to fix before it can be accepted.');
  });

  it('[DEL-8] words a structural block from how many checks failed, never the validator’s id', () => {
    expect(
      decisionInWords(
        {
          decision: 'revise',
          reason: 'blocked by validator(s) references (revised, never restarted)',
          basis: basis('validators', 1, 0, 5, { validators: ['references'] }),
        },
        {},
      ),
    ).toBe('Failed 1 structural check — to fix before it can be accepted.');
  });

  it('[DEL-8] reads a step it has no words or no facts for as the controller’s sentence, every id it cites named', () => {
    // A trace recorded before steps carried facts.
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
