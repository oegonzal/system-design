import type { ZodType } from 'zod';
import type { $ZodIssue, $ZodType } from 'zod/v4/core';

import { CUT_MARKER, cutPoint, type DeclaredBound } from './bound';
import {
  flattenIssues,
  isStructural,
  sizeOfInput,
  toSchemaIssue,
  type SchemaIssue,
} from './issues';
import {
  boundPath,
  isRecord,
  keysOf,
  locationPath,
  type BoundPath,
  type LocationPath,
  type PathKey,
} from './json-paths';
import { defOf, modelSchema, nullMeansAbsent } from './model-schema';
import { overrunsOf, type Overrun } from './overruns';

/** What the parse changed on the way to a value: never a word of prose. */
export interface Repair {
  path: LocationPath;
  at: PathKey[];
  action: 'stripped-keys' | 'trimmed' | 'dropped-null';
  detail: string;
}

export type LenientParse<T> =
  | { ok: true; value: T; overruns: Overrun[]; repairs: Repair[]; issues: SchemaIssue[] }
  | { ok: false; value: null; overruns: Overrun[]; repairs: Repair[]; issues: SchemaIssue[] };

/** Repairs can cascade — a list trimmed, then a member's key — and a few rounds settle it. */
const REPAIR_ROUNDS = 3;

/** What a lenient read gathers on the way: what it changed, what it noted, and the text it kept whole to put back. */
interface Salvage {
  repairs: Repair[];
  recorded: Overrun[];
  kept: { at: PathKey[]; text: string }[];
}

type Bounds = Readonly<Record<BoundPath, DeclaredBound>>;

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
 * Every null in `value` at a key whose null means "none", removed and
 * recorded: the model was shown that key as required and nullable, because
 * a strict endpoint takes no optional property, so null is how it leaves the
 * key out. A null at a required key stays, and refuses as the wrong type it
 * is; so does one at a key that takes null. A union is read branch by
 * branch, so a key left optional in any branch is read as absent there.
 */
function absentNulls(node: $ZodType, value: unknown, at: PathKey[], repairs: Repair[]): unknown {
  const def = defOf(node);
  switch (def.type) {
    case 'object': {
      if (!isRecord(value) || def.shape === undefined) return value;
      let out = value;
      for (const [key, child] of Object.entries(def.shape)) {
        if (!(key in out)) continue;
        const here = [...at, key];
        if (out[key] === null && nullMeansAbsent(child)) {
          out = Object.fromEntries(Object.entries(out).filter(([name]) => name !== key));
          repairs.push({ path: locationPath(here), at: here, action: 'dropped-null', detail: key });
        } else {
          const next = absentNulls(child, out[key], here, repairs);
          if (next !== out[key]) out = { ...out, [key]: next };
        }
      }
      return out;
    }
    case 'array': {
      const element = def.element;
      if (!Array.isArray(value) || element === undefined) return value;
      const out = value.map((item, index) => absentNulls(element, item, [...at, index], repairs));
      return out.some((item, index) => item !== value[index]) ? out : value;
    }
    case 'record': {
      const valueType = def.valueType;
      if (!isRecord(value) || valueType === undefined) return value;
      const out = Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          absentNulls(valueType, item, [...at, key], repairs),
        ]),
      );
      return Object.keys(out).some((key) => out[key] !== value[key]) ? out : value;
    }
    case 'union':
      return (def.options ?? []).reduce<unknown>(
        (current, option) => absentNulls(option, current, at, repairs),
        value,
      );
    case 'pipe':
      return def.in === undefined ? value : absentNulls(def.in, value, at, repairs);
    default:
      return def.innerType === undefined ? value : absentNulls(def.innerType, value, at, repairs);
  }
}

/** An aside key stripped where it sits, and recorded. */
function stripKeys(current: unknown, at: PathKey[], keys: string[], salvage: Salvage): unknown {
  const unwanted = new Set(keys);
  salvage.repairs.push({
    path: locationPath(at),
    at,
    action: 'stripped-keys',
    detail: keys.join(', '),
  });
  return updateAt(current, at, (node) =>
    isRecord(node)
      ? Object.fromEntries(Object.entries(node).filter(([key]) => !unwanted.has(key)))
      : node,
  );
}

/** A list past its ceiling trimmed to it by whole items, worst-last, and recorded with what it dropped. */
function trimList(
  current: unknown,
  at: PathKey[],
  sizes: { target: number; ceiling: number; actual: number | undefined },
  salvage: Salvage,
): unknown {
  const { target, ceiling } = sizes;
  const actual = sizes.actual ?? ceiling;
  const dropped = actual - ceiling;
  salvage.repairs.push({
    path: locationPath(at),
    at,
    action: 'trimmed',
    detail: `${dropped} dropped`,
  });
  salvage.recorded.push({
    path: locationPath(at),
    at,
    kind: 'list',
    target,
    ceiling,
    actual,
    handling: 'trimmed',
    dropped,
  });
  return updateAt(current, at, (node) => (Array.isArray(node) ? node.slice(0, ceiling) : node));
}

/** A text past its ceiling: kept whole to the cut point, cut at a word past it, parsed at its ceiling meanwhile, and recorded. */
function keepText(
  current: unknown,
  at: PathKey[],
  written: string,
  sizes: { target: number; ceiling: number },
  salvage: Salvage,
): unknown {
  const { target, ceiling } = sizes;
  const limit = cutPoint({ target, ceiling });
  // A cut string ends within the limit plus its marker, so parsing it again never cuts twice.
  const cut = written.length > limit + CUT_MARKER.length;
  const text = cut ? cutAtWord(written, limit) : written;
  salvage.kept.push({ at, text });
  salvage.recorded.push({
    path: locationPath(at),
    at,
    kind: 'text',
    target,
    ceiling,
    actual: written.length,
    handling: cut ? 'cut' : 'kept-over-ceiling',
  });
  return updateAt(current, at, () => text.slice(0, ceiling));
}

/** One round over the soft faults: an aside key stripped, a list trimmed, a text kept and cut. */
function repairRound(
  current: unknown,
  faults: readonly $ZodIssue[],
  index: Bounds,
  salvage: Salvage,
): unknown {
  let next = current;
  for (const fault of faults) {
    const at = keysOf(fault.path);
    if (fault.code === 'unrecognized_keys') {
      next = stripKeys(next, at, fault.keys, salvage);
    } else if (fault.code === 'too_big') {
      const ceiling = Number(fault.maximum);
      const target = index[boundPath(at)]?.target ?? ceiling;
      if (fault.origin === 'array') {
        next = trimList(next, at, { target, ceiling, actual: sizeOfInput(fault.input) }, salvage);
      } else if (typeof fault.input === 'string') {
        next = keepText(next, at, fault.input, { target, ceiling }, salvage);
      }
    }
  }
  return next;
}

/** The accepted value with every kept text restored onto it, and every field past its target recorded once. */
function accepted<T>(data: unknown, index: Bounds, salvage: Salvage): LenientParse<T> {
  let value = data;
  const restored = new Set<LocationPath>();
  for (const { at, text } of salvage.kept) {
    if (!hasPath(value, at)) continue;
    value = updateAt(value, at, () => text);
    restored.add(locationPath(at));
  }
  const noted = new Set(salvage.recorded.map((overrun) => overrun.path));
  const overruns = [
    ...overrunsOf(value, index).filter((overrun) => !noted.has(overrun.path)),
    ...salvage.recorded.filter(
      (overrun) => overrun.handling === 'trimmed' || restored.has(overrun.path),
    ),
  ];
  return { ok: true, value: value as T, overruns, repairs: salvage.repairs, issues: [] };
}

/**
 * The salvage ladder, total over any JSON:
 *
 * 0. A null at a key the contract leaves optional is read as absent and
 *    recorded — the model was shown that key as required and nullable.
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
  bounds?: Bounds,
): LenientParse<T> {
  const index = bounds ?? modelSchema(schema).bounds;
  const salvage: Salvage = { repairs: [], recorded: [], kept: [] };
  let current = absentNulls(schema, value, [], salvage.repairs);
  let issues: SchemaIssue[] = [];
  for (let round = 0; round <= REPAIR_ROUNDS; round++) {
    const result = schema.safeParse(current, { reportInput: true });
    if (result.success) return accepted(result.data, index, salvage);
    const faults = flattenIssues(result.error.issues, index);
    issues = faults.map((issue) => toSchemaIssue(issue, index));
    if (faults.some((fault) => isStructural(fault, index)) || round === REPAIR_ROUNDS) break;
    current = repairRound(current, faults, index, salvage);
  }
  return { ok: false, value: null, overruns: [], repairs: [], issues };
}
