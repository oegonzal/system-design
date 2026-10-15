import { textBytes } from '@sysdesign/contracts';

import { UNIT_CONTEXT_MAX_BYTES, unitContextOf } from './open-unit';

describe('what a unit of work carries of the page that opened it', () => {
  it('[BRW-16] joins the words under the landmark one node per line, in document order, names the landmark they were read from, and carries nothing from a landmark that said nothing', () => {
    expect(
      unitContextOf(['Acme builds tools for teams.', 'Senior Engineer', 'Remote'], 'main'),
    ).toEqual({
      landmark: 'main',
      text: 'Acme builds tools for teams.\nSenior Engineer\nRemote',
      omitted: 0,
    });
    expect(unitContextOf([], 'main')).toBeNull();
  });

  it('[BRW-16] keeps as many whole lines as fit the declared bound, cut at a node boundary and never inside one, and counts the lines it left out', () => {
    // Three lines whose first two fill the bound to the byte: the third does not fit, whatever its size.
    const half = 'x'.repeat((UNIT_CONTEXT_MAX_BYTES - 1) / 2);
    const twoLines = `${half}\n${half}`;
    expect(textBytes(twoLines)).toBe(UNIT_CONTEXT_MAX_BYTES - 1);
    expect(unitContextOf([half, half, 'y'], 'main')).toEqual({
      landmark: 'main',
      text: twoLines,
      omitted: 1,
    });
    // One more byte on the second line and only the first fits; bytes, not characters, are what is counted.
    expect(unitContextOf([half, `${half}é`, 'y'], 'complementary')).toEqual({
      landmark: 'complementary',
      text: half,
      omitted: 2,
    });
    // A first node past the bound on its own leaves nothing: a node is never cut inside.
    expect(unitContextOf(['x'.repeat(UNIT_CONTEXT_MAX_BYTES + 1), 'y'], 'main')).toBeNull();
  });
});
