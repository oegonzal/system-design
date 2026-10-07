import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

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
 * compiler's own parser, so a name that survives only inside a comment or a
 * string literal is correctly read as dead.
 *
 * What it deliberately does not catch: a symbol used only inside the file that
 * declares it (exported for no reason, but reached), and a name that collides
 * with an unrelated property or JSX attribute somewhere. Both make the count
 * too HIGH, so this gate under-reports and never blocks something live — the
 * only direction a build gate may be wrong in. The complement is lint's
 * unused-binding rule, which catches the local half; between them the two
 * leave very little room.
 *
 * Nor does it catch inert *logic* — an unreachable branch, a policy field no
 * controller reads. That is a review obligation, not a parse.
 */
const REPO = join(__dirname, '..');

/** Directories that hold no authored source: dependencies, build output, caches. */
const SKIP = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-dev',
  '.next-e2e',
  '.nx',
  '.git',
  'static',
  'storybook-static',
]);

/**
 * Where a module's exports are reached by something other than an `import`, so
 * a name nothing imports is still live. Each entry names who does the reaching,
 * because that is the fact that makes the exemption true — a path added here
 * without one is an exemption nobody can check.
 *
 * Framework entry points that export a DEFAULT are not listed: a default export
 * is addressed by module path and never by name, so it is skipped everywhere.
 */
const DISCOVERED: readonly { readonly path: string; readonly by: string }[] = [
  {
    path: 'packages/db/src/migrations',
    by: 'MikroORM, which discovers migration classes by globbing the folder',
  },
];

/** Storybook loads its stories by glob, naming each export as a story. */
const STORY_FILE = /\.stories\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
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

describe('inert code', () => {
  const files = sourceFiles(REPO);
  const counts = new Map<string, Map<string, number>>();
  const total = new Map<string, number>();
  for (const path of files) {
    const own = identifierCounts(readFileSync(path, 'utf8'), path);
    counts.set(path, own);
    for (const [name, n] of own) total.set(name, (total.get(name) ?? 0) + n);
  }

  it('reads the repository it is meant to guard, and every exemption still names a reacher', () => {
    expect(files.length).toBeGreaterThan(500);
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
  });

  it('every exported name is reached from somewhere other than its own declaration', () => {
    const discovered = DISCOVERED.map(({ path }) => join(REPO, path));
    const inert: string[] = [];
    for (const path of files) {
      if (STORY_FILE.test(path)) continue;
      if (discovered.some((root) => path.startsWith(root))) continue;
      const own = counts.get(path)!;
      for (const { name, line } of exportedNames(readFileSync(path, 'utf8'), path)) {
        // One occurrence in the repository, and it is in this file: the
        // declaration itself, with nothing anywhere that reads it.
        if (total.get(name) === 1 && (own.get(name) ?? 0) === 1) {
          inert.push(`${relative(REPO, path)}:${line} ${name}`);
        }
      }
    }
    expect(
      inert,
      `nothing may be exported that nothing reaches — delete it, or give it the caller it was written for:\n  ${inert.join('\n  ')}`,
    ).toEqual([]);
  });
});
