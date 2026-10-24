import { describe, expect, it } from 'vitest';

import { ALLOWED, boundaries, importsOf, packageOf, resolveRelative } from './boundaries';
import type { ChangedFile } from './index';

const file = (path: string, ...lines: string[]): ChangedFile => ({
  file: path,
  content: lines.join('\n'),
});

/**
 * The matrix itself, pinned value by value.
 *
 * The rule is only as right as this table, and the table restates what the
 * eslint tag constraints enforce — so a drift between the two should fail a
 * test here, not surface as a reviewer disagreeing with the linter.
 */
describe('the dependency matrix', () => {
  it('lets the shared vocabulary depend on nothing', () => {
    expect(ALLOWED['contracts']).toEqual([]);
  });

  it.each([
    ['criteria', ['contracts']],
    ['db', ['contracts']],
    ['config-kit', []],
    ['llm', ['contracts', 'config-kit']],
    ['run-dump', []],
    ['nest-kit', ['contracts', 'db']],
    ['design-system', ['contracts']],
    ['web-kit', ['contracts', 'design-system']],
    ['web-testing', ['contracts', 'design-system']],
    ['studio-ui', ['contracts', 'design-system', 'web-kit', 'web-testing']],
    ['quality-loop-ui', ['contracts', 'design-system', 'web-kit', 'web-testing']],
    ['govcon-ui', ['contracts', 'design-system', 'web-kit', 'web-testing']],
    ['loop-client', ['contracts']],
    ['notifications-client', ['contracts']],
    ['agentic-memory', ['contracts', 'db', 'qdrant-kit']],
    [
      'agentic-system',
      [
        'contracts',
        'db',
        'nest-kit',
        'config-kit',
        'loop-client',
        'notifications-client',
        'agentic-memory',
        'llm',
        'qdrant-kit',
      ],
    ],
    ['studio-testing', ['contracts', 'loop-client']],
    ['studio-api', ['contracts', 'db', 'nest-kit', 'loop-client', 'studio-testing']],
    ['quality-loop', ['contracts', 'db', 'llm', 'run-dump', 'nest-kit', 'qdrant-kit']],
    [
      'govcon',
      ['contracts', 'db', 'nest-kit', 'notifications-client', 'loop-client', 'studio-testing'],
    ],
    [
      'browser-session',
      [
        'contracts',
        'db',
        'nest-kit',
        'run-dump',
        'loop-client',
        'notifications-client',
        'config-kit',
        'studio-testing',
      ],
    ],
    ['memory-ingest', ['contracts', 'loop-client', 'studio-testing']],
    ['notifications', ['contracts', 'db', 'nest-kit', 'config-kit']],
    ['website', []],
  ] as const)('%s may depend only on %j', (pkg, allowed) => {
    expect(ALLOWED[pkg]).toEqual(allowed);
  });

  it('leaves the tooling-tagged hosts unconstrained, as the eslint rule does', () => {
    expect(ALLOWED['storybook']).toBeNull();
    expect(ALLOWED['studio-e2e']).toBeNull();
    expect(ALLOWED['website-e2e']).toBeNull();
  });
});

describe('boundaries', () => {
  it('passes an import the matrix allows', () => {
    const clean = boundaries([
      file(
        'packages/studio-ui/src/app/page.tsx',
        "import { Button } from '@sysdesign/design-system';",
        "import type { DesignSession } from '@sysdesign/contracts';",
      ),
    ]);
    expect(clean).toEqual([]);
  });

  it('fails an alias import the matrix forbids, at high, naming both sides', () => {
    const [found] = boundaries([
      file('packages/studio-ui/src/lib/api.ts', "import { orm } from '@sysdesign/db';"),
    ]);

    expect(found?.severity).toBe('high');
    expect(found?.category).toBe('boundary-violation');
    expect(found?.line).toBe(1);
    expect(found?.problem).toContain('studio-ui');
    expect(found?.problem).toContain('db');
    expect(found?.evidence).toContain('@sysdesign/db');
  });

  it('keeps the UI out of the server side, and the server out of the UI', () => {
    const both = boundaries([
      file('packages/design-system/src/x.ts', "import { canvas } from '@sysdesign/studio-ui';"),
      file('packages/db/src/y.ts', "import { client } from '@sysdesign/llm';"),
    ]);
    expect(both.map((f) => f.severity)).toEqual(['high', 'high']);
  });

  /** The fake loop is node-side test tooling: the API's specs may script it, a web app may not. */
  it('keeps the fake quality loop out of the web apps', () => {
    const [found] = boundaries([
      file('packages/studio-ui/src/x.ts', "import { FakeLoop } from '@sysdesign/studio-testing';"),
    ]);
    expect(found?.severity).toBe('high');
    expect(found?.category).toBe('boundary-violation');
    expect(
      boundaries([
        file(
          'packages/studio-api/src/test/fake.ts',
          "import { FakeLoop } from '@sysdesign/studio-testing';",
        ),
      ]),
    ).toEqual([]);
  });

  it('flags a deep import into an allowed package at medium', () => {
    const [found] = boundaries([
      file(
        'packages/studio-ui/src/x.ts',
        "import { tokens } from '@sysdesign/design-system/src/theme/tokens';",
      ),
    ]);

    expect(found?.severity).toBe('medium');
    expect(found?.category).toBe('deep-import');
    expect(found?.recommendation).toContain("'@sysdesign/design-system'");
  });

  /** The matrix outranks the barrel: depth does not soften a forbidden direction. */
  it('flags a deep import into a forbidden package as the boundary violation it is', () => {
    const [found] = boundaries([
      file('packages/studio-ui/src/x.ts', "import { orm } from '@sysdesign/db/src/orm.options';"),
    ]);

    expect(found?.severity).toBe('high');
    expect(found?.category).toBe('boundary-violation');
  });

  /**
   * The disguise the lint rule may not see: a relative path that walks out of
   * the package. Direction decides — a forbidden target is the same violation
   * however it is spelled.
   */
  it('flags a relative import escaping into a forbidden package at high', () => {
    const [found] = boundaries([
      file(
        'packages/studio-ui/src/lib/deep/x.ts',
        "import { options } from '../../../../db/src/orm.options';",
      ),
    ]);

    expect(found?.severity).toBe('high');
    expect(found?.category).toBe('boundary-violation');
    expect(found?.problem).toContain('Relative import');
  });

  /** Right direction, wrong spelling is export-surface's finding, not this rule's. */
  it('stays silent on a relative import into an allowed package', () => {
    expect(
      boundaries([
        file(
          'packages/studio-ui/src/x.ts',
          "import { tokens } from '../../design-system/src/theme/tokens';",
        ),
      ]),
    ).toEqual([]);
  });

  it('stays silent on relative imports inside the same package', () => {
    expect(
      boundaries([file('packages/db/src/entities/a.ts', "import { b } from '../orm.options';")]),
    ).toEqual([]);
  });

  it('lets the unconstrained hosts import both sides', () => {
    expect(
      boundaries([
        file(
          'packages/storybook/.storybook/preview.tsx',
          "import { ThemeRoot } from '@sysdesign/design-system';",
          "import { COLOR_MODES } from '@sysdesign/contracts';",
        ),
      ]),
    ).toEqual([]);
  });

  /** Deep imports break encapsulation from anywhere, even outside packages/. */
  it('flags a deep alias import from repo scripts too', () => {
    const [found] = boundaries([
      file('scripts/one-off.ts', "import { entity } from '@sysdesign/db/src/entities/finding';"),
    ]);
    expect(found?.category).toBe('deep-import');
  });

  it('skips unreadable files and non-TypeScript files', () => {
    expect(
      boundaries([
        { file: 'packages/studio-ui/src/x.ts', content: undefined },
        file('packages/studio-ui/README.md', "import { orm } from '@sysdesign/db';"),
      ]),
    ).toEqual([]);
  });
});

describe('importsOf', () => {
  it('reads every import shape this repo writes, with its line', () => {
    const refs = importsOf(
      [
        "import a from '@sysdesign/contracts';",
        'import {',
        '  b,',
        "} from '@sysdesign/db';",
        "import './side-effect';",
        "const c = require('./legacy');",
        "const d = await import('./lazy');",
      ].join('\n'),
    );

    expect(refs.map((r) => [r.specifier, r.line])).toEqual([
      ['@sysdesign/contracts', 1],
      ['@sysdesign/db', 4],
      ['./side-effect', 5],
      ['./legacy', 6],
      ['./lazy', 7],
    ]);
  });

  it('quotes the line as evidence', () => {
    const [ref] = importsOf("import a from 'x';");
    expect(ref?.text).toBe("import a from 'x';");
  });
});

describe('resolveRelative', () => {
  it('resolves within a package', () => {
    expect(resolveRelative('packages/db/src/entities/a.ts', '../orm.options')).toBe(
      'packages/db/src/orm.options',
    );
  });

  it('resolves an escape across packages', () => {
    expect(resolveRelative('packages/studio-ui/src/x.ts', '../../design-system/src/index')).toBe(
      'packages/design-system/src/index',
    );
  });

  it('treats ./ as staying put', () => {
    expect(resolveRelative('packages/db/src/a.ts', './b')).toBe('packages/db/src/b');
  });
});

describe('packageOf', () => {
  it('names the package for a path inside one, and nothing otherwise', () => {
    expect(packageOf('packages/db/src/a.ts')).toBe('db');
    expect(packageOf('tooling/code-review/review.ts')).toBeUndefined();
  });
});
