import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { readAstro } from './astro-sources';

/**
 * Nothing inert may remain in the codebase — CLAUDE.md's first rule, as a gate.
 *
 * Inert code is not merely untidy. A refactor that leaves its old names behind
 * reads exactly like code the system still runs: the next reader believes it,
 * imports it, or reasons from it, and a comment or table that names a deleted
 * file states something false. The expensive cases all have the same shape —
 * something moved, the new path works, and the old declaration and the imports
 * it left behind were never deleted.
 *
 * The decision is mechanical, so it is not a matter of taste: an exported name
 * whose identifier occurs exactly ONCE in the whole repository occurs at its
 * own declaration and nowhere else. Nothing imports it, no signature names it,
 * no spec exercises it. Counting is done over identifier TOKENS, through the
 * compiler's own parser — Astro's for an Astro component (astro-sources.ts),
 * TypeScript's for everything else — so a name that survives only inside a
 * comment or a string literal is correctly read as dead.
 *
 * An Astro component is nothing but a default export, which no name addresses,
 * so it is held to the rule its module path can be held to instead: some other
 * file imports it.
 *
 * What the name count deliberately does not catch: a symbol used only inside
 * the file that declares it (exported for no reason, but reached), and a name
 * that collides with an unrelated property or JSX attribute somewhere. Both
 * make the count too HIGH, so it under-reports rather than block something
 * live — the only direction a build gate may be wrong in. The complement is
 * lint's unused-binding rule, which catches the local half; between them the
 * two leave very little room.
 *
 * The gate is wrong the other way, blocking something live, only where a module
 * is reached without its name or its path being written in a file it reads.
 * The component rule, matching resolved paths where the name count accepts any
 * token of the name, is the exposed one: a framework that routes or globs a
 * folder, a specifier `unimported` does not resolve (a path alias, a query), an
 * importer of a kind SOURCE leaves out. Each such reach is declared, never
 * worked around: a DISCOVERED entry naming who reaches the folder, resolution
 * added to `unimported`, or the kind added to SOURCE with a reader for it.
 *
 * Nor does it catch inert *logic* — an unreachable branch, a policy field no
 * controller reads. That is a review obligation, not a parse.
 */
const REPO = join(__dirname, '..');

/**
 * Directories that hold no authored source: dependencies, build output,
 * caches, generated types (Astro's `.astro`) and local runtime state
 * (Wrangler's `.wrangler`, whose dev bundles include TypeScript).
 */
const SKIP = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-dev',
  '.next-e2e',
  '.nx',
  '.git',
  '.astro',
  '.wrangler',
  'static',
  'storybook-static',
]);

/**
 * Where a module is reached by something other than an `import`, so a name —
 * or a component — nothing imports is still live. Each entry names who does
 * the reaching, because that is the fact that makes the exemption true — a
 * path added here without one is an exemption nobody can check.
 *
 * A TypeScript entry point that exports only a DEFAULT needs no entry: a
 * default export is addressed by module path and never by name, so the
 * exported-name rule skips it everywhere. An Astro component is the exception
 * — it is held to being imported — so a folder a framework routes components
 * from is listed here.
 */
const DISCOVERED: readonly { readonly path: string; readonly by: string }[] = [
  {
    path: 'packages/db/src/migrations',
    by: 'MikroORM, which discovers migration classes by globbing the folder',
  },
  {
    path: 'packages/website/src/pages',
    by: "Astro, which routes each module in the folder and calls an endpoint's GET export by name",
  },
];

/**
 * The packages held to the stricter reading of the rule: an export only specs
 * reach is reached by nothing the running system does, so it is inert too. A
 * package joins this list once it holds to it.
 */
const SPEC_REACH_GUARDED: readonly string[] = [
  'packages/agentic-memory',
  'packages/browser-session',
  'packages/qdrant-kit',
  'packages/quality-loop',
];

/**
 * What exists to support specs rather than to run: a spec, a `*.testing.ts` or
 * `testing.ts` module and its `testing-*.ts` parts, a `testing/` folder, and
 * any module that imports the test runner.
 */
const SPEC_FILE = /\.(spec|test)\.tsx?$/;
const TEST_SUPPORT = /(^|[/.])testing([.-][\w-]+)?\.tsx?$|\/testing\//;
const isTestSupport = (path: string, source: string): boolean =>
  SPEC_FILE.test(path) || TEST_SUPPORT.test(path) || /from 'vitest'/.test(source);

/** Storybook loads its stories by glob, naming each export as a story. */
const STORY_FILE = /\.stories\.tsx?$/;

/** The sources the gate reads: TypeScript modules, and Astro components. */
const SOURCE = /\.(ts|tsx|mts|astro)$/;
const COMPONENT = /\.astro$/;

/**
 * Every source file under `dir`, this checkout's alone: the walk does not enter
 * a folder holding its own `.git`, the mark of another checkout's root — a
 * worktree, a submodule, a clone — which that checkout's own run of the gate
 * reads. Git never commits a `.git` entry, so in a fresh clone this skips
 * nothing but a submodule; in a local checkout, a nested copy read here would
 * show routes nothing imports and double every count, keeping dead exports alive.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) return SOURCE.test(entry) ? [path] : [];
    return existsSync(join(path, '.git')) ? [] : sourceFiles(path);
  });
}

const parse = (source: string, path: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const exported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const isDefault = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

/** A name a file declares and exports, with the line to open. */
export interface ExportedName {
  name: string;
  line: number;
}

/**
 * Every name a file declares AND exports, at the top level.
 *
 * Top level only, on purpose: a name inside a namespace or a `declare module`
 * is reached through its container, so the container is what must be live. A
 * destructured `export const { a } = …` is skipped — it binds no name of its
 * own to delete.
 */
export function exportedNames(source: string, path = 'sample.ts'): ExportedName[] {
  const tree = parse(source, path);
  const at = (node: ts.Node): number =>
    tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  return tree.statements.flatMap((statement) => {
    if (!exported(statement) || isDefault(statement)) return [];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name)
          ? [{ name: declaration.name.text, line: at(declaration) }]
          : [],
      );
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      return statement.name === undefined
        ? []
        : [{ name: statement.name.text, line: at(statement) }];
    }
    return [];
  });
}

/**
 * Every identifier token a file contains, by name, EXCLUDING the specifiers of
 * an `export { … }`.
 *
 * Excluded because a named re-export is a claim about a surface, not a use of
 * it: if the only thing naming a symbol is the barrel that forwards it, the
 * declaration and the barrel line are both inert. Consumers of a barrel still
 * count — they write the name in their own `import`.
 */
export function identifierCounts(source: string, path = 'sample.ts'): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isExportSpecifier(node)) return;
    if (ts.isIdentifier(node)) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  visit(parse(source, path));
  return counts;
}

/**
 * Every module specifier a TypeScript file writes — import and export
 * declarations, `import()`, `require` — as the compiler's own pre-processor
 * lists them.
 */
const moduleSpecifiers = (source: string): string[] =>
  ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);

/**
 * The components no OTHER file imports, given the specifiers each file writes.
 *
 * A relative specifier is resolved against the folder of the file that wrote
 * it, as the bundler resolves it, and Astro adds no `.astro` resolve extension,
 * so an import of a component spells its file. Only a relative specifier is
 * resolved, and only as a path: a path alias or a query (`?raw`) would read a
 * live component as unimported, so a package that writes one must add its
 * resolution here first.
 */
function unimported(
  components: readonly string[],
  imports: ReadonlyMap<string, readonly string[]>,
): string[] {
  const reached = new Set(
    [...imports].flatMap(([importer, specifiers]) =>
      specifiers
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => resolve(dirname(importer), specifier))
        .filter((target) => target !== importer),
    ),
  );
  return components.filter((component) => !reached.has(component));
}

describe('inert code', () => {
  const files = sourceFiles(REPO);
  const modules = files.filter((path) => !COMPONENT.test(path));
  const components = new Map(
    files
      .filter((path) => COMPONENT.test(path))
      .map((path) => [path, readAstro(readFileSync(path, 'utf8'))] as const),
  );
  const counts = new Map<string, Map<string, number>>();
  const imports = new Map<string, readonly string[]>();
  const support = new Set<string>();
  for (const path of modules) {
    const source = readFileSync(path, 'utf8');
    counts.set(path, identifierCounts(source, path));
    imports.set(path, moduleSpecifiers(source));
    if (isTestSupport(relative(REPO, path), source)) support.add(path);
  }
  for (const [path, component] of components) {
    counts.set(path, component.identifiers);
    imports.set(path, component.imports);
  }
  const total = new Map<string, number>();
  for (const own of counts.values()) {
    for (const [name, n] of own) total.set(name, (total.get(name) ?? 0) + n);
  }
  const discovered = (path: string): boolean =>
    DISCOVERED.some((entry) => path.startsWith(join(REPO, entry.path) + sep));

  it('reads the repository it is meant to guard, and every exemption still names a reacher', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(components.size, 'no Astro component found to read').toBeGreaterThan(0);
    // A component the compiler cannot read would count as using nothing.
    const unreadable = [...components].flatMap(([path, { errors }]) =>
      errors.map((error) => `${relative(REPO, path)}:${error}`),
    );
    expect(unreadable, 'every Astro component must parse').toEqual([]);
    for (const { path, by } of DISCOVERED) {
      // An exemption for a folder that is gone exempts nothing, and one that
      // cannot say who reaches it is an exemption nobody can check.
      expect(statSync(join(REPO, path)).isDirectory(), `${path} is gone`).toBe(true);
      expect(by, `${path} must say what reaches it without importing it`).not.toBe('');
    }
  });

  it('the rules match what they are meant to', () => {
    expect(exportedNames('export const A = 1;\nexport type B = string;')).toEqual([
      { name: 'A', line: 1 },
      { name: 'B', line: 2 },
    ]);
    expect(
      exportedNames('export function f() {}\nexport class C {}\nexport interface I {}'),
    ).toEqual([
      { name: 'f', line: 1 },
      { name: 'C', line: 2 },
      { name: 'I', line: 3 },
    ]);
    // A default export is addressed by path, and an unexported one is lint's to judge.
    expect(exportedNames('export default function Page() {}\nconst local = 1;')).toEqual([]);
    // Several declarators in one statement each name something deletable.
    expect(exportedNames('export const a = 1,\n  b = 2;')).toEqual([
      { name: 'a', line: 1 },
      { name: 'b', line: 2 },
    ]);

    // A name in a comment or a string is not a use of it.
    expect(identifierCounts('/** mentions A */\nconst s = "A";').get('A')).toBeUndefined();
    // A declaration is one occurrence; a use is another.
    expect(identifierCounts('const A = 1;').get('A')).toBe(1);
    expect(identifierCounts('const A = 1;\nconst b = A;').get('A')).toBe(2);
    // Forwarding a name is not using it; importing it is.
    expect(identifierCounts("export { A } from './a';").get('A')).toBeUndefined();
    expect(identifierCounts("import { A } from './a';\n").get('A')).toBe(1);

    // A component is read in its frontmatter, its client scripts and its tags.
    expect(readAstro('---\nconst label = SITE.name;\n---\n').identifiers.get('SITE')).toBe(1);
    const script = readAstro("<script>\n  import { NAV } from './site';\n</script>");
    expect([script.identifiers.get('NAV'), script.imports]).toEqual([1, ['./site']]);
    expect(readAstro('<Card />').identifiers.get('Card')).toBe(1);
    // A comment, text and an attribute string are not uses there either.
    expect(readAstro('<!-- A --><p title="A">A</p>').identifiers.get('A')).toBeUndefined();
    // One source span is one occurrence, however many nodes ESTree hangs on it.
    const shorthand = readAstro("---\nimport { A } from './a';\nconst { b } = A;\n---\n<p {b} />");
    expect([shorthand.identifiers.get('A'), shorthand.identifiers.get('b')]).toEqual([2, 2]);
    // Forwarding a name is not using it, in a component as in a module.
    expect(readAstro('---\nconst a = 1;\nexport { a };\n---\n').identifiers.get('a')).toBe(1);
    // A component the compiler cannot read is an error, never a count of nothing.
    expect(readAstro('---\nconst = ;\n---\n').errors).toEqual([expect.stringMatching(/^2:/)]);
    // A component is reached by a relative import from another file, never by its own.
    const importers = new Map([
      [
        '/r/pages/index.astro',
        readAstro("---\nimport Card from '../ui/Card.astro';\n---\n").imports,
      ],
      ['/r/lib/card.ts', moduleSpecifiers("export { default } from '../ui/Hero.astro';")],
      ['/r/ui/Dead.astro', readAstro("---\nimport Dead from './Dead.astro';\n---\n").imports],
    ]);
    expect(
      unimported(['/r/ui/Card.astro', '/r/ui/Hero.astro', '/r/ui/Dead.astro'], importers),
    ).toEqual(['/r/ui/Dead.astro']);

    // The walk reads its own checkout, and no checkout nested in it: a worktree
    // holds a `.git` file, a clone a `.git` folder.
    const tree = mkdtempSync(join(tmpdir(), 'inert-code-'));
    try {
      const nested = ['wt/.git', 'wt/a.ts', 'clone/.git/HEAD', 'clone/b.ts'];
      for (const file of ['.git/HEAD', 'own.ts', 'ui/Own.astro', ...nested]) {
        mkdirSync(dirname(join(tree, file)), { recursive: true });
        writeFileSync(join(tree, file), '');
      }
      const read = sourceFiles(tree).map((path) => relative(tree, path));
      expect(read.sort()).toEqual(['own.ts', join('ui', 'Own.astro')]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('every exported name is reached from somewhere other than its own declaration', () => {
    const inert: string[] = [];
    for (const path of modules) {
      if (STORY_FILE.test(path) || discovered(path)) continue;
      const own = counts.get(path);
      for (const { name, line } of exportedNames(readFileSync(path, 'utf8'), path)) {
        // One occurrence in the repository, and it is in this file: the
        // declaration itself, with nothing anywhere that reads it.
        if (total.get(name) === 1 && (own?.get(name) ?? 0) === 1) {
          inert.push(`${relative(REPO, path)}:${line} ${name}`);
        }
      }
    }
    expect(
      inert,
      `nothing may be exported that nothing reaches — delete it, or give it the caller it was written for:\n  ${inert.join('\n  ')}`,
    ).toEqual([]);
  });

  it('in a guarded package, every exported name is reached by something that runs, not only by specs', () => {
    // What a running file reads, by name: every module but the spec support.
    const running = new Map<string, number>();
    for (const [path, own] of counts) {
      if (support.has(path)) continue;
      for (const [name, n] of own) running.set(name, (running.get(name) ?? 0) + n);
    }
    const guarded = (path: string): boolean =>
      SPEC_REACH_GUARDED.some((root) => path.startsWith(join(REPO, root) + sep));
    const specOnly: string[] = [];
    for (const path of modules) {
      if (!guarded(path) || support.has(path)) continue;
      const own = counts.get(path);
      for (const { name, line } of exportedNames(readFileSync(path, 'utf8'), path)) {
        // Its own declaration is its one running occurrence, and something else names it.
        if (running.get(name) === 1 && (own?.get(name) ?? 0) === 1 && (total.get(name) ?? 0) > 1) {
          specOnly.push(`${relative(REPO, path)}:${line} ${name}`);
        }
      }
    }
    expect(
      specOnly,
      `an export only specs reach runs nowhere — delete it with its spec, move it into the spec support it serves, or give it the caller it was written for:\n  ${specOnly.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every Astro component is imported by another file, unless a framework reaches it', () => {
    const unused = unimported(
      [...components.keys()].filter((path) => !discovered(path)),
      imports,
    ).map((path) => relative(REPO, path));
    expect(
      unused,
      `a component nothing imports renders nowhere — delete it, import it where it was meant to appear, or, if something other than an import reaches its folder, add the folder to DISCOVERED naming what does:\n  ${unused.join('\n  ')}`,
    ).toEqual([]);
  });
});
