import { tokenWords } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { counted, humanizeToken } from './humanize';

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

  it('is the contract’s separator grammar, capitalised — the one a lens’s prose is worded by', () => {
    for (const token of ['data_integrity', 'max-iterations', 'critic.scale', 'a__b']) {
      expect(humanizeToken(token).toLowerCase()).toBe(tokenWords(token));
    }
  });
});

describe('counted', () => {
  it('[DEL-8] puts the noun in the number the count says — never "(s)"', () => {
    expect(counted(1, 'fix', 'fixes')).toBe('1 fix');
    expect(counted(10, 'fix', 'fixes')).toBe('10 fixes');
    expect(counted(0, 'lesson', 'lessons')).toBe('0 lessons');
  });
});
