import { join } from 'node:path';

import ts from 'typescript';

import { REPO_ROOT } from '../git-scope';
import type { Finding } from '../policy';
import type { ChangedFile } from './index';
import { ALLOWED, ALIAS_SCOPE, importsOf, packageOf, resolveRelative } from './boundaries';

/**
 * How wide a package's public surface may grow before it stops being a surface.
 *
 * A barrel re-exporting forty-plus modules is no longer a curated API — it is
 * `src/` with extra steps, and every consumer of the alias now depends on all
 * of it. The number is deliberately far above where taste would draw the line,
 * because a deterministic rule should fire on "this is structurally a
 * grab-bag", not on "this is more than I would have exported".
 */
export const MAX_BARREL_EXPORTS = 40;

/**
 * The packages the workspace reaches by alias, as tsconfig.base.json's `paths`
 * declares them: the only ones with a public surface a relative path could
 * bypass. An app has no alias, so whether a project may reach one at all is
 * the boundaries rule's question alone.
 */
const ALIASED: ReadonlySet<string> = (() => {
  const { config, error } = ts.readConfigFile(
    join(REPO_ROOT, 'tsconfig.base.json'),
    ts.sys.readFile,
  );
  if (error !== undefined) {
    throw new Error(
      `tsconfig.base.json: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  }
  const { compilerOptions } = config as { compilerOptions?: { paths?: Record<string, unknown> } };
  return new Set(
    Object.keys(compilerOptions?.paths ?? {})
      .filter((alias) => alias.startsWith(ALIAS_SCOPE))
      .map((alias) => alias.slice(ALIAS_SCOPE.length).split('/')[0] ?? ''),
  );
})();

const BARREL = /^packages\/[^/]+\/src\/index\.ts$/;
const SOURCE = /\.(ts|tsx)$/;

/** Re-export statements — the lines that widen the public surface. */
export function countReExports(content: string): number {
  return content
    .split('\n')
    .filter((line) => /^export\s+(?:\*|\{|type\s*\{|type\s+\*)/.test(line.trim()))
    .filter((line) => /\bfrom\s+['"]/.test(line)).length;
}

/**
 * Guards the shape of the package surface, from both sides:
 *
 * - a changed barrel re-exporting more than `MAX_BARREL_EXPORTS` modules is
 *   `medium` — the surface has stopped meaning anything;
 * - a changed file that reaches an *allowed*, aliased dependency by relative
 *   path is `low` (the barrel) or `medium` (past the barrel, into internals) —
 *   the direction is legal, but the spelling bypasses the public surface and
 *   the lint rule that watches the alias. Disallowed directions are
 *   boundaries' finding, at `high`; one rule per problem.
 */
export const exportSurface = (files: readonly ChangedFile[]): Finding[] => {
  const findings: Finding[] = [];

  for (const { file, content } of files) {
    if (content === undefined) continue;

    if (BARREL.test(file)) {
      const count = countReExports(content);
      if (count > MAX_BARREL_EXPORTS) {
        findings.push({
          severity: 'medium',
          file,
          category: 'wide-barrel',
          evidence: `${count} re-export statements (limit ${MAX_BARREL_EXPORTS})`,
          problem: `The package barrel re-exports ${count} modules — a surface that wide is no longer an API, and every consumer now depends on all of it.`,
          recommendation:
            'Curate the barrel: export the intended public surface and let internals stay internal.',
        });
      }
    }

    if (!SOURCE.test(file)) continue;
    const ownPackage = packageOf(file);
    if (ownPackage === undefined) continue;
    const allowed = ALLOWED[ownPackage];

    for (const ref of importsOf(content)) {
      if (!ref.specifier.startsWith('.')) continue;

      const resolved = resolveRelative(file, ref.specifier);
      const targetPackage = packageOf(`${resolved}/`);
      if (targetPackage === undefined || targetPackage === ownPackage) continue;
      if (!ALIASED.has(targetPackage)) continue;
      // Disallowed directions belong to boundaries, at high.
      if (allowed !== null && !(allowed ?? []).includes(targetPackage)) continue;

      const atBarrel = /\/src\/index$/.test(resolved) || /\/src$/.test(resolved);
      findings.push({
        severity: atBarrel ? 'low' : 'medium',
        file,
        line: ref.line,
        category: 'relative-cross-package-import',
        evidence: ref.text,
        problem: atBarrel
          ? `Reaches ${targetPackage} by relative path instead of its alias — legal direction, but invisible to the module-boundary lint and brittle under any file move.`
          : `Reaches into ${targetPackage}'s internals by relative path — bypassing both the alias and the package's public surface.`,
        recommendation: `Import from '${ALIAS_SCOPE}${targetPackage}' instead.`,
      });
    }
  }

  return findings;
};
