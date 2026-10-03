import {
  keptAtMost,
  LESSON_APPLIES_WHEN_BOUND,
  LESSON_CHUNK_BOUND,
  LESSON_INSIGHT_BOUND,
  lessonText,
  modelSchema,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES, goalBytes } from '../../core/contracts';
import { fill } from '../../core/testing';
import {
  KNOWN_HEADING,
  memoryQuerySchema,
  NOVELTY_RULE,
  PROBE_BOUND,
  RECALL_RULES,
  readIndex,
  recallRules,
  renderGoal,
  withinBudget,
} from './input';
import { admitted, maximalQuery, sampleQuery } from './testing';

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

  it('[QL-58] a program writes every field, so every bound is exact — and a candidate admits the longest lesson the store holds, a probe the longest a read of the deriver keeps', () => {
    for (const [path, declared] of Object.entries(modelSchema(memoryQuerySchema).bounds)) {
      expect(declared.ceiling, path).toBe(declared.target);
    }
    // A stored lesson is its two halves, each as a digest's lenient read kept it, joined once.
    const longestStored = lessonText({
      insight: fill(keptAtMost(LESSON_INSIGHT_BOUND)),
      appliesWhen: fill(keptAtMost(LESSON_APPLIES_WHEN_BOUND)),
    });
    expect(admitted('candidates[].text')).toBe(keptAtMost(LESSON_CHUNK_BOUND));
    expect(longestStored.length).toBeLessThanOrEqual(admitted('candidates[].text'));
    expect(admitted('probes[]')).toBe(keptAtMost(PROBE_BOUND));
  });

  it('[QL-14] the input schema is the byte budget: every field at its longest leaves room for the longest lesson the store holds, and for sixteen at the length a digest is asked for', () => {
    // Sixteen of the longest lessons would not fit: the schema refuses the query whole…
    const longest = maximalQuery();
    expect(memoryQuerySchema.safeParse(longest).success).toBe(false);

    // …so it is offered the best-ranked that fit, each whole, and never none.
    const fitted = withinBudget(longest);
    const offered = fitted.candidates.length;
    expect(offered).toBeGreaterThanOrEqual(1);
    expect(fitted.candidates).toEqual(longest.candidates.slice(0, offered));
    expect(memoryQuerySchema.safeParse(fitted).success).toBe(true);
    const goal = renderGoal(fitted);
    expect(goalBytes(goal)).toBeLessThanOrEqual(GOAL_MAX_BYTES);
    expect(readIndex(goal)?.candidates).toHaveLength(offered);
    const oneMore = { ...longest, candidates: longest.candidates.slice(0, offered + 1) };
    expect(goalBytes(renderGoal(oneMore))).toBeGreaterThan(GOAL_MAX_BYTES);

    // Lessons the length a digest asks for, every other field at its longest: all sixteen.
    const asked = maximalQuery(LESSON_CHUNK_BOUND.target);
    expect(withinBudget(asked)).toBe(asked);
    expect(memoryQuerySchema.safeParse(asked).success).toBe(true);
  });
});
