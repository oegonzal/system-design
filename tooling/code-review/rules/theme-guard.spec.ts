import { describe, expect, it } from 'vitest';

import { BANNED, exempt, themeGuard } from './theme-guard';
import type { ChangedFile } from './index';

/**
 * Every fixture assembles the banned vocabulary by concatenation — the same
 * discipline the rule itself uses — so this spec file never contains the
 * strings it tests for and a repo-wide sweep stays clean.
 */
const BRAND_A = ['cho', 'rus'].join('');
const BRAND_B = ['poke', 'mon'].join('');

const file = (path: string, content: string | undefined): ChangedFile => ({ file: path, content });

describe('themeGuard', () => {
  it('passes clean content', () => {
    expect(
      themeGuard([file('packages/studio-ui/src/x.ts', 'export const theme = tokens;')]),
    ).toEqual([]);
  });

  it('fails a file containing the first banned vocabulary, at high', () => {
    const [found] = themeGuard([
      file('packages/studio-ui/src/x.ts', `// borrowed from the ${BRAND_A} template\nexport {};`),
    ]);

    expect(found?.severity).toBe('high');
    expect(found?.category).toBe('branding');
    expect(found?.line).toBe(1);
  });

  it('fails on the second vocabulary too, in any casing', () => {
    const mixed = BRAND_B.charAt(0).toUpperCase() + BRAND_B.slice(1);
    const [found] = themeGuard([file('README.md', `A ${mixed} theme`)]);
    expect(found?.severity).toBe('high');
  });

  it('catches the vocabulary anywhere in a line, not only as a whole word', () => {
    expect(themeGuard([file('a.ts', `const x = 'my${BRAND_A}fork';`)])).toHaveLength(1);
  });

  it('points at the first offending line and counts the rest', () => {
    const [found] = themeGuard([
      file('a.ts', `clean\n${BRAND_A} here\nclean\nand ${BRAND_A} again`),
    ]);

    expect(found?.line).toBe(2);
    expect(found?.problem).toContain('2 line(s)');
    expect(found?.evidence).toBe(`${BRAND_A} here`);
  });

  it('emits one finding per file, not one per hit', () => {
    const findings = themeGuard([file('a.ts', `${BRAND_A}\n${BRAND_B}\n${BRAND_A}`)]);
    expect(findings).toHaveLength(1);
  });

  it('scans non-code files — the tripwire covers docs and config too', () => {
    expect(themeGuard([file('docs/notes.md', BRAND_B)])).toHaveLength(1);
    expect(themeGuard([file('package.json', `{"name":"${BRAND_A}"}`)])).toHaveLength(1);
  });

  it('exempts the local working-notes file wherever it sits', () => {
    expect(themeGuard([file('CLAUDE.md', BRAND_A)])).toEqual([]);
    expect(themeGuard([file('packages/db/CLAUDE.md', BRAND_B)])).toEqual([]);
  });

  it('exempts its own source, which had to state the fragments to ban them', () => {
    expect(exempt('tooling/code-review/rules/theme-guard.ts')).toBe(true);
    expect(themeGuard([file('tooling/code-review/rules/theme-guard.ts', BRAND_A)])).toEqual([]);
  });

  it('does not exempt a lookalike path', () => {
    expect(exempt('packages/studio-ui/src/theme-guard.ts')).toBe(false);
    expect(exempt('NOT-CLAUDE.md')).toBe(false);
  });

  it('treats unreadable content as nothing to scan', () => {
    expect(themeGuard([file('a.bin', undefined)])).toEqual([]);
  });
});

describe('BANNED', () => {
  it('is case-insensitive over both vocabularies', () => {
    expect(BANNED.test(BRAND_A.toUpperCase())).toBe(true);
    expect(BANNED.test(BRAND_B.toUpperCase())).toBe(true);
    expect(BANNED.test('studio')).toBe(false);
  });
});
