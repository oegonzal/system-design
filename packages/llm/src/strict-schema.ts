import { walkJsonSchema } from '@sysdesign/contracts';

/**
 * A JSON Schema as a strict structured-output endpoint will accept it.
 *
 * OpenAI's `json_schema` mode with `strict: true` guarantees the reply matches
 * the schema, and refuses the request outright for a keyword it does not take
 * rather than ignoring it. Its two structural demands this codebase already
 * meets everywhere: its output schemas are `z.strictObject` and say
 * `.nullable()` where another codebase would say `.optional()`, so every
 * object is closed and every property required. Audited over the step-plan and
 * field-answer schemas on 2026-10-06: zero structural faults between them.
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
 */

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
