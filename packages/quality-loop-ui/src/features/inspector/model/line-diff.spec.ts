import { describe, expect, it } from 'vitest';

import { countLines, lineDiff, MAX_LINES } from './line-diff';

const shape = (before: string | null, after: string | null) =>
  lineDiff(before, after).map((line) => `${line.kind[0]} ${line.text}`);

describe('comparing two rendered artifacts', () => {
  it('[QLU-7] shows the lines that changed, keeping everything else in reading order', () => {
    const before = ['a', 'b', 'c'].join('\n');
    const after = ['a', 'b2', 'c', 'd'].join('\n');
    expect(shape(before, after)).toEqual(['s a', 'r b', 'a b2', 's c', 'a d']);
    expect(countLines(lineDiff(before, after))).toEqual({ same: 2, added: 2, removed: 1 });
  });

  it('[QLU-7] a removal is listed before the addition that replaced it', () => {
    expect(shape('x', 'y')).toEqual(['r x', 'a y']);
  });

  it('[QLU-7] carries the line numbers on each side, so a reader can point at one', () => {
    const lines = lineDiff('a\nb', 'a\nc');
    expect(lines).toEqual([
      { kind: 'same', text: 'a', before: 1, after: 1 },
      { kind: 'removed', text: 'b', before: 2, after: null },
      { kind: 'added', text: 'c', before: null, after: 2 },
    ]);
  });

  it('[QLU-7] an absent side is the empty text, not a crash', () => {
    expect(shape(null, 'a')).toEqual(['a a']);
    expect(shape('a', null)).toEqual(['r a']);
    expect(lineDiff(null, null)).toEqual([]);
    expect(lineDiff('same', 'same')).toEqual([{ kind: 'same', text: 'same', before: 1, after: 1 }]);
  });

  it('[QLU-7] past the line bound the two texts are reported whole rather than compared', () => {
    const long = Array.from({ length: MAX_LINES + 1 }, (_unused, index) => `line ${index}`).join(
      '\n',
    );
    const counts = countLines(lineDiff(long, `${long}\nextra`));
    expect(counts.same).toBe(0);
    expect(counts.removed).toBe(MAX_LINES + 1);
    expect(counts.added).toBe(MAX_LINES + 2);
  });
});
