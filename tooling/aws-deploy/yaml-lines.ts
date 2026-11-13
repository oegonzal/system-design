/**
 * A line-based reading of the YAML this repository writes by hand: block
 * mappings and sequences by indentation, scalars plain, quoted or block, and
 * the one-line flow forms (`['CMD-SHELL', '…']`, `{ Name: X, ValueFrom: y }`)
 * CloudFormation templates write inline. The `yaml` package cannot be resolved
 * from tooling (pnpm keeps it in its store as another package's dependency,
 * never at the root), and what the AWS specs read — a container's name and
 * port, a parameter's default, a workflow job — is declared one line each,
 * the way tooling/code-review/config.spec.ts reads ci.yml. Blank and comment
 * lines are not lines here.
 *
 * A key is looked up among a block's own entries — its shallowest depth —
 * never in a nested mapping, so a container's `Name` is the one on its first
 * line and never an environment entry's `- Name: PORT` further down.
 */
export interface YamlLine {
  /** The line's text without its indentation. */
  text: string;
  /** The spaces before the text. */
  depth: number;
}

export function yamlLines(source: string): YamlLine[] {
  return source.split('\n').flatMap((raw) => {
    const text = raw.trim();
    if (text === '' || text.startsWith('#')) return [];
    return [{ text, depth: raw.length - raw.trimStart().length }];
  });
}

/** Whether a line is `key:` alone or `key: <value>`, as a mapping entry or as the first of a sequence item (`- key: <value>`). */
const isKey = (line: YamlLine, key: string): boolean => {
  const text = line.text.startsWith('- ') ? line.text.slice(2) : line.text;
  return text === `${key}:` || text.startsWith(`${key}: `);
};

/** The text of a `key: value` line after the key, with a sequence item's dash dropped. */
const valueText = (line: YamlLine, key: string): string =>
  (line.text.startsWith('- ') ? line.text.slice(2) : line.text).slice(key.length + 1).trim();

const shallowestDepth = (lines: readonly YamlLine[]): number =>
  Math.min(...lines.map((line) => line.depth));

/** The index of the first `key:` among the block's own entries, or -1. */
const ownKeyIndex = (lines: readonly YamlLine[], key: string): number => {
  const depth = shallowestDepth(lines);
  return lines.findIndex((line) => line.depth === depth && isKey(line, key));
};

/** Every line indented deeper than `lines[start]`, until the first that is not. */
export function nestedUnder(lines: readonly YamlLine[], start: number): YamlLine[] {
  const depth = lines[start]?.depth ?? -1;
  const nested: YamlLine[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.depth <= depth) break;
    nested.push(line);
  }
  return nested;
}

/** The lines nested under the block's own `key:`, or undefined when it has none. */
export function blockOf(lines: readonly YamlLine[], key: string): YamlLine[] | undefined {
  const start = ownKeyIndex(lines, key);
  return start === -1 ? undefined : nestedUnder(lines, start);
}

/** The lines nested under every `key:` among `lines`, at any depth, each block taken where it stands. */
export function blocksOf(lines: readonly YamlLine[], key: string): YamlLine[][] {
  return lines.flatMap((line, index) => (isKey(line, key) ? [nestedUnder(lines, index)] : []));
}

/** The keys of a block mapping: every `key:` at the block's shallowest depth. */
export function keysOf(lines: readonly YamlLine[]): string[] {
  const depth = shallowestDepth(lines);
  return lines
    .filter((line) => line.depth === depth)
    .flatMap((line) => /^([^\s:][^:]*):(?:\s|$)/.exec(line.text)?.[1] ?? []);
}

/**
 * The items of a block sequence: each `- ` at the block's shallowest depth
 * starts one, and what the dash carries (`- Name: api`) is read as the item's
 * first line, two deeper, beside the lines that follow it.
 */
export function sequenceItems(lines: readonly YamlLine[]): YamlLine[][] {
  const depth = shallowestDepth(lines);
  const items: YamlLine[][] = [];
  for (const line of lines) {
    if (line.depth === depth && line.text.startsWith('- ')) {
      items.push([{ text: line.text.slice(2), depth: depth + 2 }]);
    } else if (line.depth === depth && line.text === '-') {
      items.push([]);
    } else {
      items.at(-1)?.push(line);
    }
  }
  return items;
}

/** A scalar's value as written: single quotes unwrapped (`''` is one quote), double quotes read as JSON, anything else as is. */
export function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }
  return value;
}

/** The pieces of a flow collection's inside, split on the commas outside quotes and trimmed. */
function splitFlow(inner: string): string[] {
  const pieces: string[] = [];
  let piece = '';
  let quote: string | undefined;
  for (const char of inner) {
    if (quote !== undefined) {
      piece += char;
      if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"') {
      quote = char;
      piece += char;
    } else if (char === ',') {
      pieces.push(piece);
      piece = '';
    } else {
      piece += char;
    }
  }
  pieces.push(piece);
  return pieces.map((text) => text.trim()).filter((text) => text !== '');
}

/** The inside of a one-line flow collection, `[…]` or `{…}`. */
const flowInside = (value: string, open: string, close: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith(open) && trimmed.endsWith(close) ? trimmed.slice(1, -1) : trimmed;
};

/** The scalars of a flow sequence `[a, 'b', "c"]`, each unquoted. */
export function flowItems(value: string): string[] {
  return splitFlow(flowInside(value, '[', ']')).map(unquote);
}

/** The entries of a flow mapping `{ Name: X, Value: 'y' }`, each value unquoted. */
function flowMapping(value: string): Record<string, string> {
  return Object.fromEntries(
    splitFlow(flowInside(value, '{', '}')).flatMap((entry) => {
      const colon = entry.indexOf(':');
      return colon === -1
        ? []
        : [[entry.slice(0, colon).trim(), unquote(entry.slice(colon + 1).trim())]];
    }),
  );
}

const BLOCK_SCALAR = /^[|>][+-]?$/;

/**
 * The value of the block's own `key: value`, or undefined without one. A
 * block scalar (`|`, `>-`) is the lines under the key, joined by newlines or
 * by spaces as its indicator folds them, and a trailing newline is dropped.
 */
export function scalarOf(lines: readonly YamlLine[], key: string): string | undefined {
  const start = ownKeyIndex(lines, key);
  if (start === -1) return undefined;
  const written = valueText(lines[start] as YamlLine, key);
  if (BLOCK_SCALAR.test(written)) {
    const joiner = written.startsWith('|') ? '\n' : ' ';
    return nestedUnder(lines, start)
      .map((line) => line.text)
      .join(joiner);
  }
  return unquote(written);
}

/**
 * The value of the block's own `key:` with a `!Sub` unwrapped to its template
 * string: a one-line `!Sub '…'`, or the block form's first item (`!Sub` on
 * the key's line, then `- '…'` and the substitution map under it). Any other
 * value reads as `scalarOf` reads it, so a `!Ref X` or `!ImportValue '…'`
 * comes back as written.
 */
export function scalarOrSub(lines: readonly YamlLine[], key: string): string | undefined {
  const start = ownKeyIndex(lines, key);
  if (start === -1) return undefined;
  const written = valueText(lines[start] as YamlLine, key);
  if (written === '!Sub') {
    return unquote(sequenceItems(nestedUnder(lines, start))[0]?.[0]?.text ?? '');
  }
  if (written.startsWith('!Sub ')) return unquote(written.slice('!Sub '.length).trim());
  return scalarOf(lines, key);
}

/**
 * The scalars of the block's own `key:` sequence, written as a flow sequence
 * on the key's line or as block items under it; undefined without the key.
 */
export function sequenceOf(lines: readonly YamlLine[], key: string): string[] | undefined {
  const start = ownKeyIndex(lines, key);
  if (start === -1) return undefined;
  const written = valueText(lines[start] as YamlLine, key);
  if (written !== '') return flowItems(written);
  return sequenceItems(nestedUnder(lines, start)).map((item) => unquote(item[0]?.text ?? ''));
}

/**
 * One field of a sequence item, whether the item is a block mapping
 * (`- Name: X` then `Value: y`) or a one-line flow mapping (`- { Name: X, Value: y }`).
 */
export function fieldOf(item: readonly YamlLine[], key: string): string | undefined {
  const only = item.length === 1 ? item[0] : undefined;
  if (only !== undefined && only.text.startsWith('{')) return flowMapping(only.text)[key];
  return scalarOf(item, key);
}
