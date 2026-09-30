import { describe, expect, it } from 'vitest';

import { escapeLike } from './like';

describe('escapeLike', () => {
  it('escapes the LIKE metacharacters, the backslash included, and nothing else', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_c')).toBe('a\\_c');
    expect(escapeLike('C:\\path')).toBe('C:\\\\path');
    expect(escapeLike('plain text')).toBe('plain text');
  });
});
