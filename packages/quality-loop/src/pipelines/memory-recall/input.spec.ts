import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES, goalBytes } from '../../core/contracts';
import {
  KNOWN_HEADING,
  memoryQuerySchema,
  NOVELTY_RULE,
  RECALL_RULES,
  readIndex,
  recallRules,
  renderGoal,
} from './input';
import { maximalQuery, sampleQuery } from './testing';

describe('the memory-recall input codec', () => {
  it('[QL-14] a composed goal round-trips: the index read back is the index written', () => {
    const query = sampleQuery();
    const goal = renderGoal(query);
    expect(goal).toContain(query.query);
    expect(goal).toContain('### [m1] finding · run');
    expect(goal).toContain('### [m3] lesson · run');
    expect(readIndex(goal)).toEqual({
      pipeline: 'memory-recall',
      maxKept: 2,
      candidates: query.candidates.map((candidate, position) => ({
        alias: `m${position + 1}`,
        source: candidate.source,
      })),
    });
  });

  it('[QL-14] a plain prompt, a foreign index or a broken fence reads as no index', () => {
    expect(readIndex('# Prompt — Serve an order history\n\nJust a prompt.')).toBeNull();
    expect(readIndex('## Index\n\n```json\n{"pipeline":"other","x":1}\n```')).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
    expect(readIndex('```json\n{"pipeline":"memory-recall"}')).toBeNull();
  });

  it('[QL-50] what the producer already holds is its own aliased section, stated with the novelty rule — and a query that holds nothing renders as it always did', () => {
    const known = [
      'high · unhandled failure: no fallback when the order store is down',
      'c2 partial: lists orders newest first',
    ];
    const bare = sampleQuery();
    const screened = sampleQuery({
      known,
      rules: recallRules(known),
      candidates: bare.candidates.map((candidate, position) => ({
        ...candidate,
        origin: position === 0 ? 'chain' : 'other-pipeline',
      })),
    });
    const goal = renderGoal(screened);

    expect(goal).toContain(`${KNOWN_HEADING}\n`);
    expect(goal).toContain(`- [k1] ${known[0]}\n- [k2] ${known[1]}`);
    expect(goal).toContain(`- ${NOVELTY_RULE}`);
    // In hand before the candidates are read, each candidate's origin on its provenance line.
    expect(goal.indexOf(KNOWN_HEADING)).toBeLessThan(goal.indexOf('## Candidates'));
    expect(goal).toMatch(
      /### \[m1\] finding · run .* · ref unhandled_failure\|flow\.1 · origin chain\n/,
    );
    expect(goal).toMatch(/### \[m3\] lesson · run .* · origin other-pipeline\n/);
    // The index the validators read is unchanged by either.
    expect(readIndex(goal)).toEqual(readIndex(renderGoal(bare)));

    // Nothing in hand: no section, no rule, no origin — the query a bare recall composes.
    expect(recallRules([])).toEqual([...RECALL_RULES]);
    const plain = renderGoal(bare);
    expect(plain).not.toContain(KNOWN_HEADING);
    expect(plain).not.toContain(NOVELTY_RULE);
    expect(plain).not.toContain('origin');
  });

  it('[QL-14] the input schema is the byte budget: a maximal query renders under the goal cap', () => {
    const query = maximalQuery();
    expect(memoryQuerySchema.safeParse(query).success).toBe(true);
    const goal = renderGoal(query);
    expect(goalBytes(goal)).toBeLessThan(GOAL_MAX_BYTES);
    expect(readIndex(goal)?.candidates).toHaveLength(query.candidates.length);
  });
});
