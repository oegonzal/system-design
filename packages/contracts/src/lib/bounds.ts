import { z, type ZodType } from 'zod';
import type { $ZodIssue, $ZodType } from 'zod/v4/core';

/**
 * One declared bound for every string and list a model writes into, and the
 * salvage that keeps what it wrote.
 *
 * A bound is two numbers. The TARGET is what the model is asked for — the
 * `maxLength` or `maxItems` in the JSON Schema it sees. The CEILING is what
 * the zod schema accepts without a word: measured in-regime overshoots ran
 * +1.5%…+19% over the ask, so a quarter clears every one, and a floor keeps
 * short bounds from being tighter than a sentence. Past the ceiling the
 * parse is lenient, never a loss: prose is kept whole and recorded, prose
 * past `CUT_FACTOR` targets is cut at a word boundary with a visible marker,
 * a list is trimmed to its ceiling by whole items, and only a structural
 * fault — a wrong type, a missing field, an unknown id or enum value, an
 * empty required string — refuses the reply, with every fault named so the
 * next ask can say what broke. A size limit never discards work.
 */

export interface Bound {
  /** What the model is asked for. */
  readonly target: number;
  /** What is accepted without a word. */
  readonly ceiling: number;
}

/** Text is measured in characters; a list in items; an id is exact — target and ceiling are one number. */
export type BoundKind = 'text' | 'list' | 'id';

export interface DeclaredBound extends Bound {
  readonly kind: BoundKind;
}

/**
 * Tolerance as data, declared once: the share of the target the ceiling adds,
 * and the least it adds — forty characters matters only under ~160, two items
 * only under eight.
 */
export const BOUND_TOLERANCE = {
  text: { share: 0.25, floor: 40 },
  list: { share: 0.25, floor: 2 },
} as const;

/** Prose past this many targets is cut at a word boundary, with the marker. */
export const CUT_FACTOR = 3;
/** Appended where prose was cut, so a reader knows words are missing and a measurement knows a cut from a write. */
export const CUT_MARKER = ' […]';

/** A bound from its target: the ceiling is the larger of the share and the floor over it. */
export function bound(target: number, kind: Exclude<BoundKind, 'id'> = 'text'): Bound {
  const tolerance = BOUND_TOLERANCE[kind];
  return {
    target,
    ceiling: Math.max(Math.ceil(target * (1 + tolerance.share)), target + tolerance.floor),
  };
}

/**
 * Where a lenient read cuts prose written into this bound: three targets, or
 * the ceiling when that is more (a short target's floor can put the ceiling
 * past three targets, and nothing within the ceiling is ever cut).
 */
export const cutPoint = (b: Bound): number => Math.max(CUT_FACTOR * b.target, b.ceiling);

/**
 * The longest text a lenient read of this bound returns: what it keeps whole
 * runs to the cut point plus the marker's length, and what it cuts ends within
 * the same. Whatever must accept a value a lenient read returned — a rubric
 * handed back, a query that recalls a stored lesson — sizes against this,
 * never against the ceiling.
 */
export const keptAtMost = (b: Bound): number => cutPoint(b) + CUT_MARKER.length;

/** A bound with no tolerance: what is asked is exactly what is accepted — an engine cap, a count a caller slices to. */
export const exact = (size: number): Bound => ({ target: size, ceiling: size });

/**
 * The bound of a text composed from bounded parts and literal separators —
 * a table row joined into one statement, a lesson joined from its two halves.
 * Targets and ceilings add; a separator counts once, in both.
 */
export function composedBound(parts: readonly (Bound | string)[]): Bound {
  let target = 0;
  let ceiling = 0;
  for (const part of parts) {
    if (typeof part === 'string') {
      target += part.length;
      ceiling += part.length;
    } else {
      target += part.target;
      ceiling += part.ceiling;
    }
  }
  return { target, ceiling };
}

// ---- declaring a bound on a zod node ---------------------------------------

/**
 * Private: the nodes `bounded.*` built, with what they declared. Zod clones a
 * node on `.min/.max/.describe/.trim`, so `bounded.*` builds the whole node
 * and registers the one it returns — the rule is that `bounded.*` is the last
 * call on a node; `.optional()`, `.nullable()` and `.default()` wrap it.
 */
const registry = z.registry<DeclaredBound>();

export interface TextOptions {
  /** The least the text may have, when something must be written. */
  min?: number;
  /** Read by the model, which writes into the schema. */
  description?: string;
  /** Trim before measuring, for text a person types. */
  trim?: boolean;
}

export interface ListOptions {
  min?: number;
  description?: string;
}

export interface IdOptions {
  min?: number;
  description?: string;
}

const declared = (b: Bound, kind: BoundKind): DeclaredBound => ({
  target: b.target,
  ceiling: b.ceiling,
  kind,
});

export const bounded = {
  /** Prose: the model is asked for the target, the schema accepts the ceiling, the parse keeps the rest. */
  text(b: Bound, options: TextOptions = {}): z.ZodString {
    let node = z.string();
    if (options.trim) node = node.trim();
    if (options.min !== undefined) node = node.min(options.min);
    node = node.max(b.ceiling);
    if (options.description !== undefined) node = node.describe(options.description);
    return node.register(registry, declared(b, 'text'));
  },

  /** A list: asked for the target, accepted to the ceiling, trimmed past it by whole items. */
  list<Item extends ZodType>(b: Bound, item: Item, options: ListOptions = {}): z.ZodArray<Item> {
    let node = z.array(item);
    if (options.min !== undefined) node = node.min(options.min);
    node = node.max(b.ceiling);
    if (options.description !== undefined) node = node.describe(options.description);
    return node.register(registry, declared(b, 'list'));
  },

  /** An id or a reference: exact, never over, never cut — a wrong one is a structural fault. */
  id(max: number, options: IdOptions = {}): z.ZodString {
    let node = z.string();
    if (options.min !== undefined) node = node.min(options.min);
    node = node.max(max);
    if (options.description !== undefined) node = node.describe(options.description);
    return node.register(registry, { target: max, ceiling: max, kind: 'id' });
  },
};

/** The declaration a node carries — its own, or the one it was cloned from. */
function declaredOf(node: $ZodType | undefined): DeclaredBound | undefined {
  for (let current = node; current !== undefined; current = current._zod.parent) {
    const found = registry.get(current);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ---- paths -----------------------------------------------------------------

/**
 * Where a bound sits in a schema, index-free: `findings[].rationale`,
 * `graph.nodes[].config[].value`. The key of the bounds index and of every
 * measured table.
 */
export type BoundPath = string;

/** A path of a value, with its indices: `findings[2].rationale`, or `(root)`. */
export type LocationPath = string;

/** One step of a path into a value: a key, or an index. */
export type PathKey = string | number;

const keysOf = (at: readonly PropertyKey[]): PathKey[] =>
  at.filter((key): key is PathKey => typeof key === 'string' || typeof key === 'number');

const joinPath = (parent: string, key: string): string =>
  parent === '' ? key : `${parent}.${key}`;

/** The bound path of a zod issue path: every index becomes `[]`. */
export function boundPath(at: readonly PropertyKey[]): BoundPath {
  let path = '';
  for (const key of keysOf(at)) {
    path = typeof key === 'number' ? `${path}[]` : joinPath(path, key);
  }
  return path;
}

/** The location of a zod issue path, indices kept. */
export function locationPath(at: readonly PropertyKey[]): LocationPath {
  let path = '';
  for (const key of keysOf(at)) {
    path = typeof key === 'number' ? `${path}[${key}]` : joinPath(path, key);
  }
  return path === '' ? '(root)' : path;
}

/**
 * The bound path of a JSON Schema path — the one `z.toJSONSchema` hands its
 * override: `properties/findings/items/properties/rationale` is
 * `findings[].rationale`; a branch of `anyOf` is where its union is; a
 * record's `additionalProperties` is `*`.
 */
export function jsonSchemaBoundPath(path: readonly PathKey[]): BoundPath {
  let out = '';
  for (let index = 0; index < path.length; index++) {
    const token = path[index];
    if (token === 'properties') {
      out = joinPath(out, String(path[++index] ?? ''));
    } else if (token === 'items' || token === 'prefixItems') {
      out = `${out}[]`;
      if (token === 'prefixItems') index++;
    } else if (token === 'additionalProperties') {
      out = joinPath(out, '*');
    } else if (token === 'anyOf' || token === 'oneOf' || token === 'allOf') {
      index++;
    }
  }
  return out;
}

// ---- the schema a model is shown --------------------------------------------

export interface ModelSchema {
  /** JSON Schema with every bound at its target — what the model is asked for. */
  json: Record<string, unknown>;
  /** Every declared bound by path, for the measurements and the salvage. */
  bounds: Readonly<Record<BoundPath, DeclaredBound>>;
}

/** The mark the override leaves on a bounded node's JSON, read off and removed by the walk below. */
const STAMP = '$bound';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every schema node of a JSON Schema with its bound path, structure keys followed and nothing else. */
export function walkJsonSchema(
  node: unknown,
  path: BoundPath,
  visit: (node: Record<string, unknown>, path: BoundPath) => void,
): void {
  if (!isRecord(node)) return;
  visit(node, path);
  if (isRecord(node['properties'])) {
    for (const [key, child] of Object.entries(node['properties'])) {
      walkJsonSchema(child, joinPath(path, key), visit);
    }
  }
  if (node['items'] !== undefined) walkJsonSchema(node['items'], `${path}[]`, visit);
  if (Array.isArray(node['prefixItems'])) {
    for (const child of node['prefixItems']) walkJsonSchema(child, `${path}[]`, visit);
  }
  if (isRecord(node['additionalProperties'])) {
    walkJsonSchema(node['additionalProperties'], joinPath(path, '*'), visit);
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = node[key];
    if (Array.isArray(branches)) for (const branch of branches) walkJsonSchema(branch, path, visit);
  }
}

/**
 * One conversion: the JSON Schema the model is shown, with every declared
 * bound at its TARGET while the zod schema keeps enforcing the ceiling, and
 * the index of those bounds by path. A node reused in two places is
 * converted once and inlined twice, so the index is read off the JSON
 * rather than the conversion.
 */
export function modelSchema(schema: ZodType): ModelSchema {
  const json = z.toJSONSchema(schema, {
    override: ({ zodSchema, jsonSchema }) => {
      const found = declaredOf(zodSchema);
      if (found === undefined) return;
      const target = jsonSchema as Record<string, unknown>;
      if (found.kind === 'list') target['maxItems'] = found.target;
      else target['maxLength'] = found.target;
      target[STAMP] = found;
    },
  }) as Record<string, unknown>;
  const bounds: Record<BoundPath, DeclaredBound> = {};
  walkJsonSchema(json, '', (node, path) => {
    const stamp = node[STAMP];
    if (stamp === undefined) return;
    bounds[path] = stamp as DeclaredBound;
    delete node[STAMP];
  });
  return { json, bounds };
}

// ---- overruns ---------------------------------------------------------------

/**
 * How a field past its target was handled: `accepted` within the ceiling,
 * `kept-over-ceiling` whole past it, `cut` at a word boundary past
 * `CUT_FACTOR` targets, `trimmed` to the ceiling by whole items.
 */
export type OverrunHandling = 'accepted' | 'kept-over-ceiling' | 'cut' | 'trimmed';

export interface Overrun {
  path: LocationPath;
  at: PathKey[];
  kind: BoundKind;
  target: number;
  ceiling: number;
  /** As written: characters, or items. */
  actual: number;
  handling: OverrunHandling;
  /** Items a trimmed list lost. */
  dropped?: number;
}

/** A bound path as segments: a key, `[]` for every item, `*` for every record value. */
const segmentsOf = (path: BoundPath): string[] =>
  path === '' ? [] : path.split('.').flatMap((part) => part.split(/(?=\[\])/));

/** Every value of `value` a bound path addresses, with where it sits. */
function* resolve(
  value: unknown,
  segments: readonly string[],
  at: PathKey[] = [],
): Generator<{ at: PathKey[]; found: unknown }> {
  if (segments.length === 0) {
    yield { at, found: value };
    return;
  }
  const [head, ...rest] = segments;
  if (head === '[]') {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < value.length; index++) {
      yield* resolve(value[index], rest, [...at, index]);
    }
  } else if (head === '*') {
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) yield* resolve(child, rest, [...at, key]);
  } else if (isRecord(value) && head in value) {
    yield* resolve(value[head], rest, [...at, head]);
  }
}

/** Characters of a string or items of a list; null for a value the bound does not measure. */
function sizeOf(found: unknown, kind: BoundKind): number | null {
  if (kind === 'list') return Array.isArray(found) ? found.length : null;
  return typeof found === 'string' ? found.length : null;
}

/** Every field of a value past its target — on a value the schema accepted, all within the ceiling. */
export function overrunsOf(
  value: unknown,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): Overrun[] {
  const overruns: Overrun[] = [];
  for (const [path, declared] of Object.entries(bounds)) {
    for (const { at, found } of resolve(value, segmentsOf(path))) {
      const actual = sizeOf(found, declared.kind);
      if (actual === null || actual <= declared.target) continue;
      overruns.push({
        path: locationPath(at),
        at,
        kind: declared.kind,
        target: declared.target,
        ceiling: declared.ceiling,
        actual,
        handling: actual <= declared.ceiling ? 'accepted' : 'kept-over-ceiling',
      });
    }
  }
  return overruns;
}

// ---- issues -----------------------------------------------------------------

/**
 * One fault of a reply against its schema, in the words every reader uses:
 * the feedback on a retry, the refusal note, run.md. `soft` is a fault that
 * was noted and never refuses — a text past its bound, a list to trim, a key
 * to strip; everything else is structural.
 */
export interface SchemaIssue {
  code: string;
  path: LocationPath;
  at: PathKey[];
  message: string;
  /** For a size fault: what the schema accepts. */
  maximum?: number;
  /** For a size fault on a declared bound: what was asked. */
  target?: number;
  /** For a size fault: what was written. */
  actual?: number;
  kind?: BoundKind;
  soft: boolean;
}

const sizeOfInput = (input: unknown): number | undefined =>
  typeof input === 'string' || Array.isArray(input) ? input.length : undefined;

/**
 * The branch of a union that wins is the first whose faults are all soft:
 * the reply meant that branch and only overshot it. A union with no such
 * branch stays one structural fault at the union. Inner paths are relative
 * to the union, so they are prefixed here.
 */
function flattenIssues(
  issues: readonly $ZodIssue[],
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
  prefix: PathKey[] = [],
): $ZodIssue[] {
  const flat: $ZodIssue[] = [];
  for (const issue of issues) {
    const at = [...prefix, ...keysOf(issue.path)];
    if (issue.code === 'invalid_union' && issue.errors.length > 0) {
      const branches = issue.errors.map((branch) => flattenIssues(branch, bounds, at));
      const winner = branches.find((branch) =>
        branch.every((inner) => !isStructural(inner, bounds)),
      );
      if (winner !== undefined) {
        flat.push(...winner);
        continue;
      }
    }
    flat.push(prefix.length === 0 ? issue : { ...issue, path: at });
  }
  return flat;
}

const isRepairable = (issue: $ZodIssue): boolean =>
  issue.code === 'unrecognized_keys' || (issue.code === 'too_big' && issue.origin === 'array');

/** A text past its bound — unless the bound is an id's, which is exact. */
const isTextOverrun = (
  issue: $ZodIssue,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): boolean =>
  issue.code === 'too_big' &&
  issue.origin === 'string' &&
  bounds[boundPath(issue.path)]?.kind !== 'id';

/** Structural: not a size fault on text or a list, and not an aside key. */
const isStructural = (
  issue: $ZodIssue,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): boolean => !isRepairable(issue) && !isTextOverrun(issue, bounds);

function toSchemaIssue(
  issue: $ZodIssue,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): SchemaIssue {
  const at = keysOf(issue.path);
  const declared = bounds[boundPath(at)];
  const base: SchemaIssue = {
    code: issue.code,
    path: locationPath(at),
    at,
    message: issue.message,
    soft: false,
  };
  if (issue.code !== 'too_big') {
    return { ...base, soft: issue.code === 'unrecognized_keys' };
  }
  const kind: BoundKind =
    declared?.kind ??
    (issue.origin === 'array' ? 'list' : issue.origin === 'string' ? 'text' : 'id');
  const maximum = typeof issue.maximum === 'number' ? issue.maximum : Number(issue.maximum);
  return {
    ...base,
    maximum,
    target: declared?.target ?? maximum,
    actual: sizeOfInput(issue.input),
    kind,
    soft: kind !== 'id' && (issue.origin === 'array' || issue.origin === 'string'),
  };
}

/** Every fault of a parse as `SchemaIssue`s, unions flattened — for a caller that parsed strictly and wants the one wording. */
export const schemaIssuesOf = (
  issues: readonly $ZodIssue[],
  bounds: Readonly<Record<BoundPath, DeclaredBound>> = {},
): SchemaIssue[] => flattenIssues(issues, bounds).map((issue) => toSchemaIssue(issue, bounds));

const count = (value: number): string => value.toLocaleString('en-US');

/** `— noted, not refused`: the suffix of a soft fault, wherever one is listed. */
export const SOFT_ISSUE_NOTE = '— noted, not refused';

/** A fault's path and what is wrong there: the sizes of a size fault, or the schema's own message. */
function faultWording(issue: SchemaIssue): string {
  if (issue.maximum !== undefined && issue.actual !== undefined) {
    const unit = issue.kind === 'list' ? 'items' : 'characters';
    const asked = issue.target ?? issue.maximum;
    return `${issue.path}: ${count(issue.actual)} ${unit}; ${count(asked)} asked, ${count(issue.maximum)} accepted`;
  }
  return `${issue.path}: ${issue.message}`;
}

/**
 * The one wording of a fault: `findings[2].rationale: 1,015 characters; 900
 * asked, 1,125 accepted`, or the schema's own message after the path, with
 * the soft note where the fault did not refuse.
 */
export function describeIssue(issue: SchemaIssue): string {
  return issue.soft ? `${faultWording(issue)} ${SOFT_ISSUE_NOTE}` : faultWording(issue);
}

/**
 * What a field past its target came to, said after its sizes. Kept whole —
 * within the ceiling or past it — it was noted and not refused; a cut or a
 * trim lost work, and says what: where the text now ends, or how many items
 * went.
 */
const HANDLED: Record<OverrunHandling, (overrun: Overrun) => string> = {
  accepted: () => SOFT_ISSUE_NOTE,
  'kept-over-ceiling': () => SOFT_ISSUE_NOTE,
  cut: () => `— cut at a word boundary, marked ${CUT_MARKER.trim()}`,
  trimmed: (overrun) => {
    const dropped = overrun.dropped ?? overrun.actual - overrun.ceiling;
    return `— ${count(dropped)} ${dropped === 1 ? 'item' : 'items'} dropped`;
  },
};

/**
 * An overrun as the size fault it is — soft, never refused — so its sizes are
 * worded the way every size fault's are.
 */
export const overrunIssue = (overrun: Overrun): SchemaIssue => ({
  code: 'too_big',
  path: overrun.path,
  at: overrun.at,
  message: overrun.handling,
  maximum: overrun.ceiling,
  target: overrun.target,
  actual: overrun.actual,
  kind: overrun.kind,
  soft: true,
});

/**
 * One field past its target, in the one wording: what a diagnostic, a warning
 * and a log line say alike — its sizes as its size fault's, then whether work
 * was lost.
 */
export const describeOverrun = (overrun: Overrun): string =>
  `${faultWording(overrunIssue(overrun))} ${HANDLED[overrun.handling](overrun)}`;

// ---- the lenient parse -----------------------------------------------------

/** What the parse changed on the way to a value: never a word of prose. */
export interface Repair {
  path: LocationPath;
  at: PathKey[];
  action: 'stripped-keys' | 'trimmed';
  detail: string;
}

export type LenientParse<T> =
  | { ok: true; value: T; overruns: Overrun[]; repairs: Repair[]; issues: SchemaIssue[] }
  | { ok: false; value: null; overruns: Overrun[]; repairs: Repair[]; issues: SchemaIssue[] };

/** Repairs can cascade — a list trimmed, then a member's key — and a few rounds settle it. */
const REPAIR_ROUNDS = 3;

function updateAt(
  value: unknown,
  at: readonly PathKey[],
  fn: (current: unknown) => unknown,
): unknown {
  if (at.length === 0) return fn(value);
  const [head, ...rest] = at;
  if (Array.isArray(value) && typeof head === 'number' && head < value.length) {
    const copy = [...value];
    copy[head] = updateAt(copy[head], rest, fn);
    return copy;
  }
  if (isRecord(value) && typeof head === 'string' && head in value) {
    return { ...value, [head]: updateAt(value[head], rest, fn) };
  }
  return value;
}

function hasPath(value: unknown, at: readonly PathKey[]): boolean {
  let current = value;
  for (const key of at) {
    if (Array.isArray(current) && typeof key === 'number' && key < current.length) {
      current = current[key];
    } else if (isRecord(current) && typeof key === 'string' && key in current) {
      current = current[key];
    } else {
      return false;
    }
  }
  return true;
}

/** The text to `limit` characters, ending on a word, the marker appended. */
function cutAtWord(text: string, limit: number): string {
  const head = text.slice(0, limit);
  const boundary = head.search(/\s+\S*$/);
  return `${(boundary > 0 ? head.slice(0, boundary) : head).trimEnd()}${CUT_MARKER}`;
}

/**
 * The salvage ladder, total over any JSON:
 *
 * 1. The schema accepts the value → done, every field past its target recorded.
 * 2. Otherwise the faults are sorted: an aside key is stripped and a list past
 *    its ceiling is trimmed to it by whole items, worst-last, as every list
 *    asks to be ordered; a text past its ceiling is soft; the rest is
 *    structural — a wrong type, a missing field, an unknown id or enum value,
 *    an empty required string, an id over its max.
 * 3. Any structural fault refuses the value, with every fault named and the
 *    soft ones marked so the feedback says "noted, not refused".
 * 4. Soft faults alone: a text within `CUT_FACTOR` targets is kept whole;
 *    past that it is cut at the last word boundary and marked. The parse runs
 *    with each such text temporarily at its ceiling, so defaults and
 *    transforms apply, and the kept text is restored onto the result.
 *
 * `bounds` defaults to the schema's own declarations; a caller that already
 * built the model schema hands them over.
 */
export function parseLenient<T>(
  schema: ZodType<T>,
  value: unknown,
  bounds?: Readonly<Record<BoundPath, DeclaredBound>>,
): LenientParse<T> {
  const index = bounds ?? modelSchema(schema).bounds;
  const repairs: Repair[] = [];
  const recorded: Overrun[] = [];
  const kept: { at: PathKey[]; text: string }[] = [];
  let current = value;
  let issues: SchemaIssue[] = [];

  for (let round = 0; round <= REPAIR_ROUNDS; round++) {
    const result = schema.safeParse(current, { reportInput: true });
    if (result.success) {
      let data: unknown = result.data;
      const restored = new Set<LocationPath>();
      for (const { at, text } of kept) {
        if (!hasPath(data, at)) continue;
        data = updateAt(data, at, () => text);
        restored.add(locationPath(at));
      }
      const noted = new Set(recorded.map((overrun) => overrun.path));
      const overruns = [
        ...overrunsOf(data, index).filter((overrun) => !noted.has(overrun.path)),
        ...recorded.filter(
          (overrun) => overrun.handling === 'trimmed' || restored.has(overrun.path),
        ),
      ];
      return { ok: true, value: data as T, overruns, repairs, issues: [] };
    }

    const faults = flattenIssues(result.error.issues, index);
    issues = faults.map((issue) => toSchemaIssue(issue, index));
    if (faults.some((fault) => isStructural(fault, index)) || round === REPAIR_ROUNDS) break;

    for (const fault of faults) {
      const at = keysOf(fault.path);
      if (fault.code === 'unrecognized_keys') {
        const unwanted = new Set(fault.keys);
        current = updateAt(current, at, (node) =>
          isRecord(node)
            ? Object.fromEntries(Object.entries(node).filter(([key]) => !unwanted.has(key)))
            : node,
        );
        repairs.push({
          path: locationPath(at),
          at,
          action: 'stripped-keys',
          detail: fault.keys.join(', '),
        });
      } else if (fault.code === 'too_big') {
        const declared = index[boundPath(at)];
        const ceiling = Number(fault.maximum);
        const target = declared?.target ?? ceiling;
        const actual = sizeOfInput(fault.input);
        if (fault.origin === 'array') {
          current = updateAt(current, at, (node) =>
            Array.isArray(node) ? node.slice(0, ceiling) : node,
          );
          const dropped = (actual ?? ceiling) - ceiling;
          repairs.push({
            path: locationPath(at),
            at,
            action: 'trimmed',
            detail: `${dropped} dropped`,
          });
          recorded.push({
            path: locationPath(at),
            at,
            kind: 'list',
            target,
            ceiling,
            actual: actual ?? ceiling,
            handling: 'trimmed',
            dropped,
          });
        } else if (typeof fault.input === 'string') {
          const written = fault.input;
          const limit = cutPoint({ target, ceiling });
          // A cut string ends within the limit plus its marker, so parsing it again never cuts twice.
          const cut = written.length > limit + CUT_MARKER.length;
          const text = cut ? cutAtWord(written, limit) : written;
          current = updateAt(current, at, () => text.slice(0, ceiling));
          kept.push({ at, text });
          recorded.push({
            path: locationPath(at),
            at,
            kind: 'text',
            target,
            ceiling,
            actual: written.length,
            handling: cut ? 'cut' : 'kept-over-ceiling',
          });
        }
      }
    }
  }
  return { ok: false, value: null, overruns: [], repairs: [], issues };
}
