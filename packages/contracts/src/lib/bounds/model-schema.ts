import { z, type ZodType } from 'zod';
import { safeParse, type $ZodType } from 'zod/v4/core';

import type { DeclaredBound } from './bound';
import { declaredOf } from './bounded';
import { isRecord, joinPath, type BoundPath } from './json-paths';

export interface ModelSchema {
  /** JSON Schema with every bound at its target — what the model is asked for. */
  json: Record<string, unknown>;
  /** Every declared bound by path, for the measurements and the salvage. */
  bounds: Readonly<Record<BoundPath, DeclaredBound>>;
}

/** The mark the override leaves on a bounded node's JSON, read off and removed by the walk below. */
const STAMP = '$bound';

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

/** A zod node's declaration, read for what it wraps and which of its keys may be absent. */
interface ZodDef {
  type: string;
  shape?: Record<string, $ZodType>;
  element?: $ZodType;
  valueType?: $ZodType;
  options?: readonly $ZodType[];
  innerType?: $ZodType;
  in?: $ZodType;
}

export const defOf = (node: $ZodType): ZodDef => node._zod.def as ZodDef;

/**
 * True for a key whose null means "none": the contract lets the output leave
 * it out — `.optional()`, however wrapped — and does not itself take null,
 * so a null there can only be the model's way of leaving it out.
 */
export const nullMeansAbsent = (node: $ZodType): boolean =>
  node._zod.optout === 'optional' && !safeParse(node, null).success;

/**
 * What the contract leaves optional, the model is shown as required and
 * nullable. A strict endpoint takes no optional property — it refused one on
 * every call of a twelve-step session, 2026-10-07, in under 200 ms each —
 * and null is how the model says "none"; `parseLenient` reads it back as
 * absent. A key that already takes null is shown as it is.
 */
function showOptionalAsNullable(zodSchema: $ZodType, json: Record<string, unknown>): void {
  const def = defOf(zodSchema);
  const properties = json['properties'];
  if (def.type !== 'object' || def.shape === undefined || !isRecord(properties)) return;
  for (const [key, child] of Object.entries(def.shape)) {
    if (!nullMeansAbsent(child) || !(key in properties)) continue;
    properties[key] = { anyOf: [properties[key], { type: 'null' }] };
  }
  json['required'] = Object.keys(properties);
}

/**
 * One conversion: the JSON Schema the model is shown, with every declared
 * bound at its TARGET while the zod schema keeps enforcing the ceiling, every
 * optional key required and nullable, and the index of those bounds by path.
 * A node reused in two places is converted once and inlined twice, so the
 * index is read off the JSON rather than the conversion.
 */
export function modelSchema(schema: ZodType): ModelSchema {
  const json = z.toJSONSchema(schema, {
    override: ({ zodSchema, jsonSchema }) => {
      const target = jsonSchema as Record<string, unknown>;
      showOptionalAsNullable(zodSchema, target);
      const found = declaredOf(zodSchema);
      if (found === undefined) return;
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
