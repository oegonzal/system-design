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

export const keysOf = (at: readonly PropertyKey[]): PathKey[] =>
  at.filter((key): key is PathKey => typeof key === 'string' || typeof key === 'number');

export const joinPath = (parent: string, key: string): string =>
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

/** A JSON object: what a path's key steps into. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
