import { describe, expect, it } from 'vitest';

import { fileSize, MAX_LINES } from './file-size';
import { countReExports, exportSurface, MAX_BARREL_EXPORTS } from './export-surface';
import { RULE_NAMES, runRules, type ChangedFile } from './index';

const file = (path: string, content: string | undefined): ChangedFile => ({ file: path, content });

const linesOf = (count: number) =>
  Array.from({ length: count }, (_, i) => `// line ${i}`).join('\n');

describe('fileSize', () => {
  it('passes a file at the limit exactly', () => {
    expect(fileSize([file('a.ts', linesOf(MAX_LINES))])).toEqual([]);
  });

  it('warns at medium one line over', () => {
    const [found] = fileSize([file('a.ts', linesOf(MAX_LINES + 1))]);

    expect(found?.severity).toBe('medium');
    expect(found?.category).toBe('oversized-file');
    expect(found?.evidence).toContain(String(MAX_LINES + 1));
  });

  it('only measures TypeScript sources', () => {
    expect(fileSize([file('data.json', linesOf(2_000))])).toEqual([]);
    expect(fileSize([file('notes.md', linesOf(2_000))])).toEqual([]);
  });

  it('treats unreadable content as nothing to measure', () => {
    expect(fileSize([file('a.ts', undefined)])).toEqual([]);
  });
});

describe('countReExports', () => {
  it('counts star, named and type re-exports', () => {
    expect(
      countReExports(
        [
          "export * from './lib/a';",
          "export { b } from './lib/b';",
          "export type { C } from './lib/c';",
        ].join('\n'),
      ),
    ).toBe(3);
  });

  it('does not count local declarations', () => {
    expect(countReExports('export const x = 1;\nexport function y() {}')).toBe(0);
  });
});

describe('exportSurface', () => {
  const barrel = (count: number) =>
    Array.from({ length: count }, (_, i) => `export * from './lib/m${i}';`).join('\n');

  it('accepts a barrel at the limit', () => {
    expect(
      exportSurface([file('packages/contracts/src/index.ts', barrel(MAX_BARREL_EXPORTS))]),
    ).toEqual([]);
  });

  it('flags a barrel past the limit at medium', () => {
    const [found] = exportSurface([
      file('packages/contracts/src/index.ts', barrel(MAX_BARREL_EXPORTS + 1)),
    ]);

    expect(found?.severity).toBe('medium');
    expect(found?.category).toBe('wide-barrel');
  });

  it('only treats a package root index as a barrel', () => {
    expect(
      exportSurface([file('packages/db/src/lib/index.ts', barrel(MAX_BARREL_EXPORTS + 5))]),
    ).toEqual([]);
  });

  /** Right direction, wrong spelling: the alias keeps the surface honest. */
  it('flags reaching an allowed package barrel by relative path at low', () => {
    const [found] = exportSurface([
      file(
        'packages/studio-ui/src/x.ts',
        "import { Button } from '../../design-system/src/index';",
      ),
    ]);

    expect(found?.severity).toBe('low');
    expect(found?.category).toBe('relative-cross-package-import');
    expect(found?.recommendation).toContain('@sysdesign/design-system');
  });

  it('flags reaching an allowed package internals by relative path at medium', () => {
    const [found] = exportSurface([
      file(
        'packages/studio-ui/src/x.ts',
        "import { tokens } from '../../design-system/src/theme/tokens';",
      ),
    ]);

    expect(found?.severity).toBe('medium');
  });

  /** Forbidden directions are boundaries' finding, at high — never doubled here. */
  it('leaves a forbidden-direction relative import to the boundaries rule', () => {
    expect(
      exportSurface([
        file('packages/studio-ui/src/x.ts', "import { orm } from '../../db/src/orm.options';"),
      ]),
    ).toEqual([]);
  });

  it('stays silent on same-package relative imports', () => {
    expect(
      exportSurface([file('packages/db/src/entities/a.ts', "import { b } from '../orm.options';")]),
    ).toEqual([]);
  });
});

describe('runRules', () => {
  it('stamps every finding with its rule source', () => {
    const findings = runRules([
      file(
        'packages/studio-ui/src/big.ts',
        `import { orm } from '@sysdesign/db';\n${linesOf(500)}`,
      ),
    ]);

    const sources = findings.map((f) => f.source).sort();
    expect(sources).toEqual(['rules/boundaries', 'rules/file-size']);
  });

  it('returns nothing for a clean change set', () => {
    expect(
      runRules([file('packages/studio-ui/src/x.ts', "import {} from '@sysdesign/contracts';")]),
    ).toEqual([]);
  });

  it('registers exactly the four documented rules', () => {
    expect([...RULE_NAMES].sort()).toEqual([
      'boundaries',
      'export-surface',
      'file-size',
      'theme-guard',
    ]);
  });
});
