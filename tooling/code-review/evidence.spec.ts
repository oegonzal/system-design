import { describe, expect, it } from 'vitest';

import { evidenceAppearsIn, normaliseForMatch, sideOf, stripDiffMarkers } from './evidence';

/**
 * This guard deletes findings, so its failure mode is the expensive direction:
 * a true finding removed because a model re-wrapped a line is invisible — the
 * developer never learns the pipeline had something to say, and the run record
 * shows a clean pass. Every case below is about *not* doing that.
 */
const diffOf = (lines: string[]) => lines.map((line) => `+${line}`).join('\n');

describe('evidenceAppearsIn', () => {
  /**
   * The canonical hard case: a block comment, taken from a diff whose lines
   * carry `+` prefixes, re-wrapped at a different column, and elided with `…`.
   */
  it('verifies a re-wrapped, marker-stripped, elided block-comment quote', () => {
    const corpus = diffOf([
      '  /**',
      '   * `useSyncExternalStore` rather than `useState` + `useEffect`, so the very',
      '   * first render already has the right answer. An effect-based version renders',
      '   * a default and then corrects itself.',
      '   */',
    ]);

    const evidence =
      '/**\n   * `useSyncExternalStore` rather than `useState` + `useEffect`, so the very\n   * first render already has the right answer. An effect-based version render…';

    expect(evidenceAppearsIn(evidence, corpus).verified).toBe(true);
  });

  it('survives a different wrap column', () => {
    const corpus = diffOf(['const value = compute(a, b);', '// a note about the value']);
    expect(evidenceAppearsIn('const value =\n  compute(a, b);', corpus).verified).toBe(true);
  });

  it('survives tabs against spaces and indentation drift', () => {
    const corpus = '\t\tif (ready) {\n\t\t\treturn value;\n\t\t}';
    expect(evidenceAppearsIn('  if (ready) {\n    return value;\n  }', corpus).verified).toBe(true);
  });

  it('survives the typography a model substitutes when quoting', () => {
    const corpus = "the reviewer's note — with a straight quote";
    expect(evidenceAppearsIn('the reviewer’s note — with a straight quote', corpus).verified).toBe(
      true,
    );
  });

  /**
   * Some models quote a diff line with its `+` and some without. After
   * whitespace removal those normalise differently, which is why both the raw
   * and the marker-stripped corpus are searched.
   */
  it('verifies a quote that kept the diff markers', () => {
    const corpus = diffOf(['export const answer = 42;']);
    expect(evidenceAppearsIn('+export const answer = 42;', corpus).verified).toBe(true);
    expect(evidenceAppearsIn('export const answer = 42;', corpus).verified).toBe(true);
  });

  /**
   * A critic reviewing a modified line quotes the *result*; in the patch those
   * lines are separated by the removed one, so searching the patch text alone
   * reports a true finding as unsupported. Hence the after-side haystack.
   */
  it('verifies a quote of the code as the change leaves it', () => {
    const corpus = [
      ' export class CreateSessionDto {',
      '   @IsString()',
      '-  @Length(1, 50)',
      '+  @Length(1, SESSION_NAME_MAX_LENGTH)',
      '   name!: string;',
    ].join('\n');

    const evidence = '@IsString()\n  @Length(1, SESSION_NAME_MAX_LENGTH)\n  name!: string;';
    expect(evidenceAppearsIn(evidence, corpus).verified).toBe(true);
  });

  it('verifies a quote of the code as it stood before', () => {
    const corpus = ' const a = 1;\n-const b = 2;\n+const b = 3;\n const c = 4;';
    expect(evidenceAppearsIn('const a = 1;\nconst b = 2;\nconst c = 4;', corpus).verified).toBe(
      true,
    );
  });

  describe('elision', () => {
    const corpus = diffOf(['function a() {', '  // twenty lines', '}', 'function b() {}']);

    it('treats a trailing ellipsis as a prefix', () => {
      expect(evidenceAppearsIn('function a() {…', corpus).verified).toBe(true);
    });

    it('requires interior segments in order', () => {
      expect(evidenceAppearsIn('function a() {…function b() {}', corpus).verified).toBe(true);
      expect(evidenceAppearsIn('function b() {}…function a() {', corpus).verified).toBe(false);
    });
  });

  it('rejects a quote that was never shown', () => {
    const check = evidenceAppearsIn('a line nobody wrote', diffOf(['something else entirely']));
    expect(check.verified).toBe(false);
    expect(check.reason).toBe('not-found');
  });

  it('reports an empty quote as empty rather than verified', () => {
    expect(evidenceAppearsIn('   ', 'anything').reason).toBe('empty');
  });

  /**
   * The test that stops a lazy `new RegExp(evidence)` implementation. Evidence
   * routinely contains regex metacharacters, and a constructed pattern would
   * either throw or silently match the wrong thing.
   */
  it('matches literally, not as a pattern', () => {
    expect(evidenceAppearsIn('.*', 'nothing here').verified).toBe(false);
    expect(evidenceAppearsIn('.*', 'a literal .* appears').verified).toBe(true);
    expect(evidenceAppearsIn('items[0]?.value ?? $fallback', 'x').verified).toBe(false);
  });

  /** A crash in the matcher must never be able to delete a finding. */
  it('never throws, whatever it is handed', () => {
    const nasty = ['\uD800', 'x'.repeat(1_000_000), '((((', '\\'];
    for (const value of nasty) {
      expect(() => evidenceAppearsIn(value, 'corpus')).not.toThrow();
      expect(() => evidenceAppearsIn('corpus', value)).not.toThrow();
    }
  });
});

describe('normaliseForMatch', () => {
  /**
   * Removal, not collapse. Collapsing to a single space still fails when a model
   * re-wraps a long line at a different column, which is what a quoted docstring
   * always does.
   */
  it('removes whitespace rather than collapsing it', () => {
    expect(normaliseForMatch('a  b\n\tc')).toBe('abc');
  });

  it('keeps case, because models quote code casing accurately', () => {
    expect(normaliseForMatch('AbC')).toBe('AbC');
  });
});

describe('sideOf', () => {
  const corpus = ' kept\n-gone\n+added\n more';

  it('reads the after side without the removed lines', () => {
    expect(sideOf(corpus, 'after')).toBe('kept\nadded\nmore');
  });

  it('reads the before side without the added lines', () => {
    expect(sideOf(corpus, 'before')).toBe('kept\ngone\nmore');
  });
});

describe('stripDiffMarkers', () => {
  it('strips body markers but leaves the file headers intact', () => {
    const stripped = stripDiffMarkers('--- a/x.ts\n+++ b/x.ts\n+added\n-removed\n unchanged');
    expect(stripped).toContain('--- a/x.ts');
    expect(stripped).toContain('+++ b/x.ts');
    expect(stripped).toContain('\nadded\n');
    expect(stripped).toContain('\nremoved\n');
  });
});
