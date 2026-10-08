import { walkJsonSchema } from '@sysdesign/contracts';

/**
 * A JSON Schema as a strict structured-output endpoint will accept it.
 *
 * OpenAI's `json_schema` mode with `strict: true` guarantees the reply matches
 * the schema, and refuses the request outright for a keyword it does not take
 * rather than ignoring it. Its two structural demands are met by construction:
 * output schemas are `z.strictObject`, so every object is closed, and the
 * contracts' `modelSchema` shows whatever a contract leaves optional as
 * required and nullable, reading a null there back as absent, so every
 * property is required. The demand is checked, not trusted — `strictSchemaFaults`
 * names every place a schema breaks it, and the engine refuses to boot a
 * pipeline whose output schema does. Measured 2026-10-07: one `.optional()`
 * property on the step plan was refused by the endpoint on every call, in
 * under 200 ms, and a whole session ran twelve steps without a single plan.
 *
 * Which keywords the subset takes is measured, not assumed, and it is wider
 * than the caution this file was first written with. Tested against the live
 * endpoints on 2026-10-06, every one of `maxLength`, `minLength`, `pattern`,
 * `format`, `maxItems`, `minItems`, `minimum`, `maximum`, `multipleOf`,
 * `$schema` and `const` was accepted — by OpenAI and by a local Ollama alike.
 * Only `oneOf` was refused, and only by OpenAI: *"'oneOf' is not permitted"*.
 *
 * Dropping them cost more than it saved. A producer twice wrote prose into a
 * `ref` — `"search box"` — which `pattern` would have made impossible to
 * return; stripped, the endpoint had nothing to enforce, the reply came back
 * well-formed and wrong, and the zod parse refused it a step later. So this
 * sends the schema as it is, and converts the one construct that is genuinely
 * refused.
 *
 * Measured again 2026-10-08, on Ollama 0.33.1 with the browser-step producer
 * schema: the grammar compiler refused the schema outright — 400, *"Failed to
 * initialize samplers: failed to parse grammar"* — and accepted it once
 * `minLength`/`maxLength` were left out; `pattern` and `maxItems` were not
 * the cause. Which keywords an endpoint cannot take is a fact about the
 * endpoint, declared in its config as `omitKeywords`; `withoutKeywords`
 * applies it, and the zod parse still enforces every one of them on the reply.
 */

/** The keywords an endpoint's grammar compiler may refuse; each is still enforced on the reply by the zod parse. */
export const OMITTABLE_KEYWORDS = [
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
] as const;
export type OmittableKeyword = (typeof OMITTABLE_KEYWORDS)[number];

/** The schema without the given keywords at every node — a deep copy, the caller's schema untouched; the schema itself when there are none. */
export function withoutKeywords(
  schema: Record<string, unknown>,
  keywords: readonly OmittableKeyword[],
): Record<string, unknown> {
  if (keywords.length === 0) return schema;
  const copy = structuredClone(schema) as Record<string, unknown>;
  walkJsonSchema(copy, '', (node) => {
    for (const keyword of keywords) delete node[keyword];
  });
  return copy;
}

/** What the subset takes instead of `oneOf`; for a closed set of variants the two say the same thing. */
export const UNION_KEYWORD = 'anyOf';

/**
 * The schema with `oneOf` read as `anyOf`, and nothing else changed.
 *
 * A deep copy: the schema the caller handed over is the one the zod parse
 * still enforces, and nothing here may reach it.
 */
export function strictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(schema) as Record<string, unknown>;
  walkJsonSchema(copy, '', (node) => {
    if (!Array.isArray(node['oneOf'])) return;
    node[UNION_KEYWORD] = node['oneOf'];
    delete node['oneOf'];
  });
  return copy;
}

/**
 * Every place `schema` falls short of what the endpoint demands of its
 * structure — an object left open, or a property the object does not
 * require — by the bound path of the object it sits on. Empty when the
 * endpoint will take the schema. The rule is the endpoint's own refusal,
 * recorded 2026-10-07: *"'required' is required to be supplied and to be an
 * array including every key in properties"*.
 */
export function strictSchemaFaults(schema: Record<string, unknown>): string[] {
  const faults: string[] = [];
  walkJsonSchema(schema, '', (node, path) => {
    if (node['type'] !== 'object' && node['properties'] === undefined) return;
    const where = path === '' ? 'the root object' : path;
    if (node['additionalProperties'] !== false) faults.push(`${where}: open object`);
    const properties = Object.keys((node['properties'] as object | undefined) ?? {});
    const required = new Set((node['required'] as string[] | undefined) ?? []);
    for (const key of properties) {
      if (!required.has(key)) faults.push(`${where}: ${key} is optional`);
    }
  });
  return faults;
}
