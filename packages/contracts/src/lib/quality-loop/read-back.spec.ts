import { describe, expect, it } from 'vitest';

import { z } from 'zod';

import {
  cutPointOf,
  objectionLines,
  objectionsOf,
  OBJECTIONS_BOUND,
  positionOf,
  routePositional,
  type PositionalPlan,
} from './read-back';
import { judgedRun } from './run-fixtures';

/** The smallest plan of positional parts: a list of words, addressed `part.N`. */
const wordsSchema = z.strictObject({ words: z.array(z.string()), last: z.boolean() });
type Words = z.infer<typeof wordsSchema>;
const PART = /^part\.(\d+)$/;
const WORDS: PositionalPlan<Words> = {
  schema: wordsSchema,
  grammar: PART,
  locate: (position) => `part.${position + 1}`,
  units: (plan) => plan.words.length,
  irrevocable: (plan) => plan.last,
};
const plan: Words = { words: ['a', 'b', 'c'], last: false };
const WORDING = { none: '(none)', heading: 'Why:' };

describe('the positional read-back', () => {
  it('[QL-73] reads a position from a location by the grammar it is given, and nothing from any other location', () => {
    expect(positionOf('part.3', PART)).toBe(2);
    expect(positionOf('assessment', PART)).toBeNull();
    expect(positionOf('action.2', PART)).toBeNull();
  });

  it('[QL-73] cuts at the first faulted position, whole for a non-positional objector or one outside the grammar, and not at all for none', () => {
    expect(cutPointOf([], PART)).toBeNull();
    expect(
      cutPointOf(
        [
          { at: ['part.3'], positional: true },
          { at: ['part.2'], positional: true },
        ],
        PART,
      ),
    ).toBe(1);
    expect(cutPointOf([{ at: ['part.2'], positional: false }], PART)).toBe('whole');
    expect(cutPointOf([{ at: [], positional: true }], PART)).toBe('whole');
    expect(cutPointOf([{ at: ['assessment'], positional: true }], PART)).toBe('whole');
  });

  it('[QL-73] routes by the shape it is given: whole, prefix, faulted first part, under-judged, and the irrevocable plan held to accept', () => {
    const accepted = routePositional(judgedRun('words', { artifact: plan }), 1, WORDS);
    expect(accepted).toMatchObject({ executable: true, executePrefix: 3, reason: null });

    const cut = routePositional(
      judgedRun('words', {
        artifact: plan,
        finalDecision: 'escalate',
        validation: [
          {
            validatorId: 'limits',
            gate: 'cut',
            problems: [{ severity: 'high', message: 'c is out', locationRefs: ['part.3'] }],
          },
        ],
      }),
      4,
      WORDS,
    );
    expect(cut).toMatchObject({ executable: true, executePrefix: 2 });
    expect(cut.objections).toEqual([
      { step: 4, from: 'limits', at: ['part.3'], detail: 'c is out' },
    ]);

    const first = routePositional(
      judgedRun('words', {
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: false,
        findings: [{ type: 'x', locationRefs: ['part.1'] }],
      }),
      1,
      WORDS,
    );
    expect(first.executable).toBe(false);
    expect(first.reason).toBe('part.1 was faulted');

    const underJudged = routePositional(
      judgedRun('words', { artifact: plan, finalDecision: 'escalate', evidenceSufficient: false }),
      1,
      WORDS,
    );
    expect(underJudged.executable).toBe(false);

    const irrevocable = { ...plan, last: true };
    expect(
      routePositional(
        judgedRun('words', { artifact: irrevocable, finalDecision: 'escalate' }),
        1,
        WORDS,
      ).executable,
    ).toBe(false);
    expect(
      routePositional(
        judgedRun('words', { artifact: irrevocable, finalDecision: 'accept' }),
        1,
        WORDS,
      ).executable,
    ).toBe(true);
    expect(routePositional(judgedRun('words', { artifact: null }), 1, WORDS).reason).toBe(
      'no-artifact',
    );
    expect(
      routePositional(judgedRun('words', { artifact: { not: 'words' } }), 1, WORDS).reason,
    ).toContain('schema');
  });

  it('[QL-73] carries every shortfall the evaluator settled, with its statement, and renders the objections in the words it is given', () => {
    const run = judgedRun('words', {
      artifact: plan,
      finalDecision: 'escalate',
      criteria: [{ criterionId: 'c1', result: 'partial', locationRefs: ['part.2'] }],
      contract: [{ id: 'c1', kind: 'progress', statement: 'Say every word.' }],
    });
    const [best] = run.trace?.iterations ?? [];
    expect(objectionsOf(best, 2, run.trace?.contract.criteria ?? [])).toEqual([
      { step: 2, from: 'c1', at: ['part.2'], detail: 'partial: Say every word.' },
    ]);
    expect(objectionLines([], WORDING)).toEqual(['(none)']);
    const many = Array.from({ length: OBJECTIONS_BOUND.target + 2 }, (_, i) => ({
      step: i + 1,
      from: 'limits',
      at: i === 0 ? [] : [`part.${i}`],
      detail: `objection ${i + 1}`,
    }));
    const lines = objectionLines(many, WORDING);
    expect(lines[0]).toBe('Why:');
    expect(lines[1]).toBe('- the plan as a whole — objection 1');
    expect(lines[2]).toBe('- part.1 — objection 2');
    expect(lines).toHaveLength(OBJECTIONS_BOUND.target + 2);
    expect(lines.at(-1)).toBe('(2 older objection(s) not listed)');
  });
});
