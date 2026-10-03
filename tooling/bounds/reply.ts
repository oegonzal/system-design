import { jsonSchemaBoundPath, type BoundPath, type PathKey } from '@sysdesign/contracts';
import { jsonCandidates } from '@sysdesign/llm';

/**
 * A recorded reply, measured the way its own call asked: every string and
 * list the JSON Schema the model was shown gave a size, keyed by bound path
 * in contracts' own spelling (`jsonSchemaBoundPath`), so a measurement keys
 * exactly as `modelSchema(schema).bounds` does. A field the schema gave no
 * size is not measured, and a key it does not name is not walked.
 */
export interface FieldSize {
  path: BoundPath;
  /** Characters of a string, items of a list. */
  size: number;
  /** What this call asked for: the `maxLength` or `maxItems` it was shown. */
  asked: number;
}

type JsonNode = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonNode =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A value's JSON Schema type. */
function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

/** Whether a schema node admits a value's type — how the branch of a union a value took is found. */
function admits(node: JsonNode, value: unknown): boolean {
  const declared = node['type'];
  if (declared === undefined) return true;
  const types = Array.isArray(declared) ? declared : [declared];
  const actual = typeOf(value);
  return types.includes(actual) || (actual === 'integer' && types.includes('number'));
}

export function measureReply(value: unknown, schema: unknown): FieldSize[] {
  const sizes: FieldSize[] = [];
  const walk = (current: unknown, node: unknown, at: PathKey[]): void => {
    if (!isRecord(node)) return;
    for (const union of ['anyOf', 'oneOf'] as const) {
      const branches = node[union];
      if (!Array.isArray(branches)) continue;
      const taken = branches.findIndex((branch) => isRecord(branch) && admits(branch, current));
      if (taken >= 0) walk(current, branches[taken], [...at, union, taken]);
    }
    const all = node['allOf'];
    if (Array.isArray(all))
      all.forEach((branch, index) => walk(current, branch, [...at, 'allOf', index]));

    const maxLength = node['maxLength'];
    if (typeof current === 'string' && typeof maxLength === 'number') {
      sizes.push({ path: jsonSchemaBoundPath(at), size: current.length, asked: maxLength });
    }
    if (Array.isArray(current)) {
      const maxItems = node['maxItems'];
      if (typeof maxItems === 'number') {
        sizes.push({ path: jsonSchemaBoundPath(at), size: current.length, asked: maxItems });
      }
      for (const item of current) walk(item, node['items'], [...at, 'items']);
    }
    if (isRecord(current)) {
      const properties = isRecord(node['properties']) ? node['properties'] : {};
      for (const [key, child] of Object.entries(current)) {
        if (Object.hasOwn(properties, key)) {
          walk(child, properties[key], [...at, 'properties', key]);
        } else if (isRecord(node['additionalProperties'])) {
          walk(child, node['additionalProperties'], [...at, 'additionalProperties']);
        }
      }
    }
  };
  walk(value, schema, []);
  return sizes;
}

/** The keys the schema's root requires: what tells the reply apart from any other object in the text. */
const requiredKeys = (schema: unknown): string[] =>
  isRecord(schema) && Array.isArray(schema['required'])
    ? schema['required'].filter((key): key is string => typeof key === 'string')
    : [];

/**
 * The object a call wrote, as written: the first candidate of its text that
 * parses to an object holding every key its schema requires — so a value the
 * seam kept, cut or trimmed, and a reply it refused, are measured at the size
 * the model wrote — else the validated response, else nothing.
 */
export function replyOf(text: string | null, response: unknown, schema: unknown): unknown {
  const required = requiredKeys(schema);
  for (const candidate of jsonCandidates(text ?? '')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (isRecord(parsed) && required.every((key) => Object.hasOwn(parsed, key))) return parsed;
  }
  return isRecord(response) ? response : null;
}
