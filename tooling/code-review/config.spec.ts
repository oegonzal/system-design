import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { DECLARED_ENV, loadReviewConfig, REVIEW_ENV, ReviewConfigError } from './config';
import { PROFILES } from './critics';
import { DEFAULT_RUNS_DIR } from './persist';

const HERE = __dirname;
const REPO_ROOT = join(HERE, '..', '..');

describe('the review configuration', () => {
  it('reads the scope from argv and picks the profile it implies', () => {
    const staged = loadReviewConfig(['--staged'], {});
    expect(staged.scope).toEqual({ kind: 'staged' });
    expect(staged.profile).toBe('quick');
    expect(staged.settings).toEqual(PROFILES.quick);
    expect(staged.runsDir).toBe(DEFAULT_RUNS_DIR);
    expect(staged.record).toBe(true);
    expect(staged.evidenceGuard).toBe('warn');

    const pr = loadReviewConfig(['--base=origin/main', '--markdown=review.md', '--no-record'], {});
    expect(pr.scope).toEqual({ kind: 'base', ref: 'origin/main' });
    expect(pr.profile).toBe('full');
    expect(pr.markdownOut).toBe('review.md');
    expect(pr.record).toBe(false);
    expect(loadReviewConfig(['--staged', '--profile=full'], {}).profile).toBe('full');
  });

  it('applies each declared override, and a flag outranks its variable', () => {
    const config = loadReviewConfig(['--staged'], {
      [REVIEW_ENV.maxDiffChars]: '1234',
      [REVIEW_ENV.evidenceGuard]: 'enforce',
      [REVIEW_ENV.runsDir]: '/tmp/runs',
      [REVIEW_ENV.intent]: 'tighten the polling loop',
      GITHUB_STEP_SUMMARY: '/tmp/summary.md',
    });
    expect(config.settings.diffBudgetChars).toBe(1234);
    expect(config.settings.maxFileChars).toBe(PROFILES.quick.maxFileChars);
    expect(config.evidenceGuard).toBe('enforce');
    expect(config.runsDir).toBe('/tmp/runs');
    expect(config.intent).toBe('tighten the polling loop');
    expect(config.stepSummaryPath).toBe('/tmp/summary.md');
    expect(
      loadReviewConfig(['--staged', '--runs-dir=/tmp/flag'], { [REVIEW_ENV.runsDir]: '/tmp/env' })
        .runsDir,
    ).toBe('/tmp/flag');
  });

  it('refuses what it cannot use, naming the flag or the variable — never a silent default', () => {
    expect(() => loadReviewConfig([], {})).toThrow(/--staged or --base/);
    expect(() => loadReviewConfig(['--staged', '--base=main'], {})).toThrow(/exactly one/);
    // A space instead of `=`, an unknown flag, an empty value: refused, not ignored.
    expect(() => loadReviewConfig(['--staged', '--profile', 'full'], {})).toThrow(
      /unknown or malformed flag "--profile"/,
    );
    expect(() => loadReviewConfig(['--staged', '--verbose'], {})).toThrow(/"--verbose"/);
    expect(() => loadReviewConfig(['--base='], {})).toThrow(/"--base="/);
    expect(() => loadReviewConfig(['--staged=yes'], {})).toThrow(/"--staged=yes"/);
    expect(() => loadReviewConfig(['--staged', '--profile=huge'], {})).toThrow(
      /unknown profile "huge"/,
    );
    expect(() => loadReviewConfig(['--staged'], { [REVIEW_ENV.maxDiffChars]: 'lots' })).toThrow(
      new RegExp(`${REVIEW_ENV.maxDiffChars} must be a positive integer`),
    );
    expect(() => loadReviewConfig(['--staged'], { [REVIEW_ENV.evidenceGuard]: 'strict' })).toThrow(
      ReviewConfigError,
    );
  });

  it('records where it ran, and marks every Claude Code process it spawns as inside a review', () => {
    const ci = loadReviewConfig(['--staged'], {
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: '42',
      GITHUB_REF: 'refs/pull/7/merge',
    }).ci;
    expect(ci).toEqual({
      isCi: true,
      provider: 'github-actions',
      runId: '42',
      ref: 'refs/pull/7/merge',
    });
    expect(loadReviewConfig(['--staged'], { CI: '1' }).ci).toEqual({ isCi: true });
    expect(loadReviewConfig(['--staged'], {}).ci).toEqual({ isCi: false });

    const claudeEnv = loadReviewConfig(['--staged'], { HOME: '/h' }).claudeEnv;
    expect(claudeEnv).toEqual({ HOME: '/h', [REVIEW_ENV.running]: '1' });
  });
});

describe('the profiles', () => {
  it('give the pull-request profile more room than the pre-commit one', () => {
    expect(PROFILES.quick.diffBudgetChars).toBeLessThan(PROFILES.full.diffBudgetChars);
  });

  /** Guards against a transposed edit making the per-file cap the larger number. */
  it('keep the per-file cap inside the total budget, and every limit positive', () => {
    for (const settings of Object.values(PROFILES)) {
      expect(settings.maxFileChars).toBeLessThanOrEqual(settings.diffBudgetChars);
      expect(settings.budgetUsd).toBeGreaterThan(0);
      expect(settings.timeoutMs).toBeGreaterThan(0);
      expect(settings.critics.length).toBeGreaterThan(0);
    }
  });
});

/**
 * One source of truth, held to it. Three places could grow a flag of their
 * own — a review module, the pre-commit hook, the CI review job — and each is
 * checked against the declaration, so a new knob has to be declared (and so
 * documented and validated) to exist at all.
 */
describe('one source of truth for every knob', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
      return /\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name) ? [path] : [];
    });

  /**
   * Structural, not textual: every module is parsed, and any reach for the
   * process environment or argv outside config.ts fails — a property or
   * element access, a destructuring of \`process\`, or an import of \`env\`,
   * \`argv\` or the module itself from \`process\` / \`node:process\`.
   */
  it('no review module but config.ts reaches for the environment or argv', () => {
    const PROCESS_MODULES = new Set(['process', 'node:process']);
    const READS = new Set(['env', 'argv']);
    const violations: string[] = [];

    for (const file of sources(HERE).filter((f) => !f.endsWith(join('code-review', 'config.ts')))) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const processNames = new Set(['process']);
      const flag = (node: ts.Node, what: string) =>
        violations.push(
          `${relative(REPO_ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${what}`,
        );
      const isProcess = (node: ts.Expression): boolean =>
        (ts.isIdentifier(node) && processNames.has(node.text)) ||
        (ts.isPropertyAccessExpression(node) && node.name.text === 'process');

      const visit = (node: ts.Node): void => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          PROCESS_MODULES.has(node.moduleSpecifier.text)
        ) {
          const clause = node.importClause;
          if (clause?.name) processNames.add(clause.name.text);
          const bindings = clause?.namedBindings;
          if (bindings && ts.isNamespaceImport(bindings)) processNames.add(bindings.name.text);
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
              if (READS.has((element.propertyName ?? element.name).text))
                flag(element, `imports ${element.name.text} from process`);
            }
          }
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          READS.has(node.name.text) &&
          isProcess(node.expression)
        ) {
          flag(node, node.getText(source));
        }
        if (ts.isElementAccessExpression(node) && isProcess(node.expression)) {
          flag(node, node.getText(source));
        }
        if (
          ts.isVariableDeclaration(node) &&
          node.initializer &&
          ts.isObjectBindingPattern(node.name) &&
          isProcess(node.initializer)
        ) {
          flag(node, `destructures ${node.name.getText(source)} from process`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('the pre-commit hook names no variable the config does not declare', () => {
    const hook = readFileSync(join(REPO_ROOT, '.githooks', 'pre-commit'), 'utf8');
    const named = new Set([...hook.matchAll(/\$\{?([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]));
    expect([...named].filter((name) => !DECLARED_ENV.has(name))).toEqual([]);
  });

  it('the CI review job sets no variable the config does not declare, and no API key', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const job = workflow.slice(workflow.indexOf('\n  review:'));
    const end = job.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
    const block = end === -1 ? job : job.slice(0, end + 1);
    const keys = new Set([...block.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]));
    expect(keys.size).toBeGreaterThan(0);
    expect([...keys].filter((name) => !DECLARED_ENV.has(name))).toEqual([]);
    expect(block).not.toMatch(/ANTHROPIC_API_KEY/);
  });
});
