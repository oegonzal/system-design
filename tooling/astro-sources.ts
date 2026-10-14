import { parse, type DiagnosticMessage } from '@astrojs/compiler-rs';

/**
 * An Astro component (`.astro`), read for the repo's gates (inert code, the
 * site's imports) the way a TypeScript module is read there: through the
 * compiler that builds it, never through the shape of its text.
 *
 * Astro's compiler returns the whole file as one ESTree tree. Verified on
 * @astrojs/compiler-rs 0.5.1: the frontmatter is an `AstroFrontmatter` whose
 * `program` holds its TypeScript; the template is JSX, with expressions in
 * `JSXExpressionContainer`s and tag and attribute names as `JSXIdentifier`s;
 * and the body of every JavaScript `<script>`, `is:inline` and `define:vars`
 * included, is an `AstroScript` with a `program` of its own. A `<style>`, an
 * HTML comment and a script of any other type (JSON-LD, an import map) stay
 * text, so a name inside them is, rightly, no use of it.
 */

/** A node of that tree, as far as this reader looks at one. */
interface EstreeNode {
  type?: string;
  start?: number;
  end?: number;
  /** A string on an identifier; a node on a JSX element or a type parameter. */
  name?: unknown;
  source?: { value?: unknown } | null;
}

/** The identifier tokens: bindings and references, and JSX tag and attribute names. */
const IDENTIFIERS = new Set(['Identifier', 'JSXIdentifier']);

/** The nodes that name a module, as a string literal `source`. */
const MODULE_REFERENCES = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
]);

/** What the gate reads from one component. */
interface AstroSource {
  /**
   * Every identifier token by name, counted once per source span. ESTree hangs
   * two nodes on one shorthand name (`imported` and `local` of `import { A }`,
   * key and value of `{ a }`, the name and the expression of an `{a}`
   * attribute), where the TypeScript reader sees one. An `export { … }`
   * specifier is skipped, as it is there: forwarding a name is not using it.
   */
  identifiers: Map<string, number>;
  /** Every module specifier the component writes, in its frontmatter and its scripts. */
  imports: string[];
  /** The compiler's errors, as `line:column text`: a component it could not read. */
  errors: string[];
}

/** A compiler error at the first span it labels. */
const located = ({ text, labels: [first] }: DiagnosticMessage): string =>
  first === undefined ? text : `${first.line}:${first.column + 1} ${text}`;

/** One component, read through Astro's compiler. */
export function readAstro(source: string): AstroSource {
  const { ast, diagnostics } = parse(source);
  const names = new Map<string, string>();
  const imports: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const node = value as EstreeNode;
    if (node.type === 'ExportSpecifier') return;
    if (IDENTIFIERS.has(node.type ?? '') && typeof node.name === 'string') {
      names.set(`${node.start}:${node.end}`, node.name);
    }
    if (MODULE_REFERENCES.has(node.type ?? '') && typeof node.source?.value === 'string') {
      imports.push(node.source.value);
    }
    Object.values(node).forEach(visit);
  };
  visit(ast);

  const identifiers = new Map<string, number>();
  for (const name of names.values()) identifiers.set(name, (identifiers.get(name) ?? 0) + 1);
  return {
    identifiers,
    imports,
    errors: diagnostics.filter(({ severity }) => severity === 'error').map(located),
  };
}
