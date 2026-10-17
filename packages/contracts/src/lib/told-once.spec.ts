import { describe, expect, it } from 'vitest';

import { ToldOnce } from './told-once';

describe('ToldOnce', () => {
  it('remembers the last keys told, the oldest forgotten first, and a key told again counts as the newest', () => {
    const told = new ToldOnce(3);
    for (const key of ['a', 'b', 'c']) told.add(key);
    expect(['a', 'b', 'c'].map((key) => told.has(key))).toEqual([true, true, true]);
    told.add('a');
    told.add('d');
    expect(['a', 'b', 'c', 'd'].map((key) => told.has(key))).toEqual([true, false, true, true]);
    expect(told.has('nope')).toBe(false);
  });
});
