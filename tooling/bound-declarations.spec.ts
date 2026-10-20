import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every bound a model writes into is declared once, through `bounded`.
 *
 * A bound is a target and a ceiling (`packages/contracts/src/lib/bounds/`):
 * the model is asked for the target, the schema accepts the ceiling, and the
 * parse keeps what runs past it. A raw `.max()` on a string or a list is a
 * bound with no target — one number that is both the ask and the refusal —
 * so none may remain in a schema file. This gate reads the syntax tree of
 * the files that declare their bounds (`SCHEMA_FILES`; a file joins the list
 * when it migrates) and fails three ways:
 *
 * - a `.max(` on a `z.string(…)` or `z.array(…)` chain, outside `bounds/bounded.ts`;
 * - a `bounded.*` call that is not the last member call of its chain, since
 *   zod clones on `.min/.max/.describe` and the clone is not the node that
 *   was registered — only `.optional()`, `.nullable()`, `.nullish()` and
 *   `.default()` may wrap it;
 * - an exported `*_BOUND` nothing reads, so a declaration cannot sit beside
 *   the raw number it was meant to replace.
 */
const REPO = join(__dirname, '..');
const BOUNDS_FILE = 'packages/contracts/src/lib/bounds/bounded.ts';

/** The schema files that declare their bounds through `bounded`. */
const SCHEMA_FILES = [
  'packages/contracts/src/lib/canvas.schema.ts',
  'packages/contracts/src/lib/model.schema.ts',
  'packages/contracts/src/lib/design-prompt.schema.ts',
  'packages/contracts/src/lib/prompts.ts',
  'packages/contracts/src/lib/star-stories.ts',
  'packages/contracts/src/lib/quality-loop/evidence.ts',
  'packages/contracts/src/lib/quality-loop/lessons.ts',
  'packages/contracts/src/lib/quality-loop/read-back.ts',
  'packages/contracts/src/lib/browser-session/field-answers.schema.ts',
  'packages/contracts/src/lib/browser-session/answer-suggestions.schema.ts',
  'packages/contracts/src/lib/browser-session/observation.schema.ts',
  'packages/contracts/src/lib/browser-session/step-plan.schema.ts',
  'packages/contracts/src/lib/browser-session/mission-sections.ts',
  'packages/contracts/src/lib/browser-session/mission-marks.ts',
  'packages/contracts/src/lib/browser-session/mission-stops.ts',
  'packages/contracts/src/lib/units/identity.ts',
  'packages/contracts/src/lib/units/record.ts',
  'packages/contracts/src/lib/units/mission-identity.ts',
  'packages/contracts/src/lib/units/mission-taken.ts',
  'packages/contracts/src/lib/units/mission-context.ts',
  'packages/contracts/src/lib/units/advice.ts',
  'packages/contracts/src/lib/units/session-events.ts',
  'packages/contracts/src/lib/tool-session/tool-plan.schema.ts',
  'packages/contracts/src/lib/tool-session/tool-index.ts',
  'packages/contracts/src/lib/agentic-system/strategy.ts',
  'packages/contracts/src/lib/agentic-system/memory.ts',
  'packages/quality-loop/src/core/stages/schemas.ts',
  'packages/quality-loop/src/core/outputs/experience-record.ts',
  'packages/quality-loop/src/pipelines/experience-digest/output.ts',
  'packages/quality-loop/src/pipelines/document-digest/output.ts',
  'packages/quality-loop/src/pipelines/register-digest/output.ts',
  'packages/quality-loop/src/pipelines/memory-recall/input.ts',
  'packages/quality-loop/src/pipelines/memory-recall/output.ts',
  'packages/quality-loop/src/pipelines/experience-digest/input.ts',
  'packages/quality-loop/src/pipelines/experience-digest/from-run.ts',
  'packages/quality-loop/src/pipelines/system-design/output.ts',
  'packages/quality-loop/src/pipelines/agentic-design/output.ts',
  'packages/quality-loop/src/modules/router/classifier/llm-brief-classifier.ts',
  'packages/studio-api/src/modules/prompts/prompt-requests.ts',
  'packages/quality-loop/src/modules/memory/query-probes/llm-query-probes.ts',
];

/** The calls that may follow a `bounded.*` node: they wrap it, never clone it. */
const WRAPPERS = new Set(['optional', 'nullable', 'nullish', 'default']);

/** The zod constructors whose chains a bound is declared on. */
const BOUNDED_ROOTS = new Set(['string', 'array']);

const SKIP = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-dev',
  '.next-e2e',
  'storybook-static',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
  });
}

function nodesOf(source: string, path = 'sample.ts'): { tree: ts.SourceFile; nodes: ts.Node[] } {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { tree, nodes };
}

/** An expression without the parentheses, type assertions and `!` around it. */
const bare = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isTypeAssertionExpression(node) ||
  ts.isNonNullExpression(node)
    ? bare(node.expression)
    : node;

/** `x.name(…)` → `name`, or null for a plain function call. */
const methodOf = (call: ts.CallExpression): string | null => {
  const callee = bare(call.expression);
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
};

/** `object.name(…)` → `object`, for an identifier receiver; null otherwise. */
const receiverOf = (call: ts.CallExpression): string | null => {
  const callee = bare(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const receiver = bare(callee.expression);
  return ts.isIdentifier(receiver) ? receiver.text : null;
};

/**
 * The constructor at the root of a call's fluent chain —
 * `z.string().min(1).max(3)` roots at `z.string` — as `z.<name>`, or null
 * when the chain does not begin at `z`.
 */
function zodRootOf(call: ts.CallExpression): string | null {
  let node: ts.Node = call;
  for (;;) {
    if (!ts.isCallExpression(node)) return null;
    if (receiverOf(node) === 'z') return methodOf(node);
    const callee = bare(node.expression);
    if (!ts.isPropertyAccessExpression(callee)) return null;
    node = bare(callee.expression);
  }
}

const lineOf = (tree: ts.SourceFile, node: ts.Node): number =>
  tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

/** Every `.max(` on a string or list chain, by line. */
export function rawMaxCalls(source: string, path = 'sample.ts'): number[] {
  const { tree, nodes } = nodesOf(source, path);
  return nodes.flatMap((node) => {
    if (!ts.isCallExpression(node) || methodOf(node) !== 'max') return [];
    const root = zodRootOf(node);
    return root !== null && BOUNDED_ROOTS.has(root) ? [lineOf(tree, node)] : [];
  });
}

/** Every `bounded.*` call followed by a member call that is not a wrapper, by line. */
export function boundedNotLast(source: string, path = 'sample.ts'): number[] {
  const { tree, nodes } = nodesOf(source, path);
  return nodes.flatMap((node) => {
    if (!ts.isCallExpression(node) || receiverOf(node) !== 'bounded') return [];
    for (let current: ts.Node = node; ;) {
      const member = current.parent;
      const next = member?.parent;
      if (!member || !ts.isPropertyAccessExpression(member) || member.expression !== current) break;
      if (!next || !ts.isCallExpression(next) || next.expression !== member) break;
      if (!WRAPPERS.has(member.name.text)) return [lineOf(tree, node)];
      current = next;
    }
    return [];
  });
}

/** Every `export const X_BOUND` a file declares. */
export function boundExports(source: string, path = 'sample.ts'): string[] {
  const { nodes } = nodesOf(source, path);
  return nodes.flatMap((node) => {
    if (!ts.isVariableStatement(node)) return [];
    const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) return [];
    return node.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text.endsWith('_BOUND')
        ? [declaration.name.text]
        : [],
    );
  });
}

describe('bound declarations', () => {
  const read = (relative: string): string => readFileSync(join(REPO, relative), 'utf8');

  it('finds every schema file it is meant to guard, and the declarations file', () => {
    for (const file of [BOUNDS_FILE, ...SCHEMA_FILES]) {
      expect(existsSync(join(REPO, file)), `${file} is gone`).toBe(true);
    }
  });

  it('the rules match what they are meant to', () => {
    // A raw `.max` on a string or list chain, however the chain is built.
    expect(
      rawMaxCalls('const a = z.string().min(1).max(3);\nconst b = z.array(z.string()).max(2);'),
    ).toEqual([1, 2]);
    expect(rawMaxCalls('const a = z.string().trim().max(3).optional();')).toEqual([1]);
    // A number's `.max` and a bounded chain are not raw bounds.
    expect(rawMaxCalls('const a = z.number().int().min(1).max(3);')).toEqual([]);
    expect(rawMaxCalls('const a = bounded.text(b, { min: 1 }).optional();')).toEqual([]);
    // `bounded.*` is the last call but for a wrapper.
    expect(boundedNotLast("const a = bounded.text(b).describe('x');")).toEqual([1]);
    expect(boundedNotLast('const a = bounded.list(b, item).min(1);')).toEqual([1]);
    expect(
      boundedNotLast(
        'const a = bounded.text(b).optional();\nconst c = bounded.text(b).nullable();\nconst d = bounded.list(b, item).default([]);',
      ),
    ).toEqual([]);
    expect(boundedNotLast("const a = bounded.text(b).optional().describe('x');")).toEqual([1]);
    expect(
      boundExports(
        'export const A_BOUND = bound(1);\nconst B_BOUND = bound(2);\nexport const C_MAX = 3;',
      ),
    ).toEqual(['A_BOUND']);
  });

  it('no schema file bounds a string or a list with a raw .max()', () => {
    const offenders = SCHEMA_FILES.flatMap((file) =>
      rawMaxCalls(read(file), file).map((line) => `${file}:${line}`),
    );
    expect(offenders, 'declare these through bounded.text / bounded.list / bounded.id').toEqual([]);
  });

  it('a bounded.* call is the last call on its node, wrapped only by optional, nullable, nullish or default', () => {
    const offenders = SCHEMA_FILES.flatMap((file) =>
      boundedNotLast(read(file), file).map((line) => `${file}:${line}`),
    );
    expect(offenders, 'zod clones on .min/.max/.describe; pass those through the options').toEqual(
      [],
    );
  });

  it('every exported *_BOUND is read somewhere', () => {
    const corpus = sourceFiles(join(REPO, 'packages'))
      .filter((path) => !/\.spec\.(ts|tsx)$/.test(path))
      .map((path) => ({ path: path.slice(REPO.length + 1), text: readFileSync(path, 'utf8') }));
    const unused = SCHEMA_FILES.flatMap((file) =>
      boundExports(read(file), file).flatMap((name) => {
        const uses = corpus.reduce(
          (count, { text }) => count + (text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0),
          0,
        );
        // One occurrence is the declaration itself.
        return uses > 1 ? [] : [`${file}: ${name}`];
      }),
    );
    expect(unused, 'a bound nothing reads is a number waiting to drift').toEqual([]);
  });
});
