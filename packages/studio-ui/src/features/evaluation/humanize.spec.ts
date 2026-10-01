import { describe, expect, it } from 'vitest';

import { humanizeToken } from './humanize';

describe('humanizeToken', () => {
  it('turns a snake, kebab, dotted or spaced token into a capitalised phrase', () => {
    expect(humanizeToken('unhandled_failure')).toBe('Unhandled failure');
    expect(humanizeToken('max-iterations')).toBe('Max iterations');
    expect(humanizeToken('quality_attributes')).toBe('Quality attributes');
    expect(humanizeToken('critic.requirements')).toBe('Critic requirements');
    expect(humanizeToken('coverage')).toBe('Coverage');
  });

  it('is a grammar, not a table — an unseen token still reads', () => {
    expect(humanizeToken('some_future-type')).toBe('Some future type');
    expect(humanizeToken('evaluator.quality_v2')).toBe('Evaluator quality v2');
    expect(humanizeToken('')).toBe('');
  });
});
