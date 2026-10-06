import { walkJsonSchema } from '@sysdesign/contracts';

/**
 * A JSON Schema as a strict structured-output endpoint will accept it.
 *
 * OpenAI's `json_schema` mode with `strict: true` guarantees the reply matches
 * the schema — but only over a subset of JSON Schema, and it refuses the
 * request outright for a keyword outside it rather than ignoring the keyword.
 * The two structural demands it makes, every object closed and every property
 * required, this codebase already meets everywhere: its output schemas are
 * `z.strictObject` and say `.nullable()` where another codebase would say
 * `.optional()`. Audited on 2026-10-06 over the step-plan and field-answer
 * schemas: zero structural faults between them.
 *
 * What does not survive is the sizing. A declared bound reaches the model as
 * `maxLength` or `maxItems`, and those are not in the subset — so rather than
 * drop what they say, each one is written into the node's `description`, where
 * the model still reads it. Nothing is lost on correctness either way: the
 * zod parse enforces the ceiling on the reply whatever the request carried,
 * and the salvage ladder decides what an overrun costs.
 */

/**
 * Keywords a strict endpoint does not take, and how each one reads once it has
 * to be said in words instead. Declared as a table because the subset is the
 * endpoint's and will move: a keyword added to the subset is a line removed
 * from here, and one withdrawn is a line added.
 */
export const UNSUPPORTED_KEYWORDS: Readonly<Record<string, (value: unknown) => string | null>> = {
  maxLength: (v) => `at most ${String(v)} characters`,
  minLength: (v) => (Number(v) > 0 ? `at least ${String(v)} characters` : null),
  maxItems: (v) => `at most ${String(v)} items`,
  minItems: (v) => (Number(v) > 0 ? `at least ${String(v)} items` : null),
  pattern: (v) => `matching ${String(v)}`,
  format: (v) => `in ${String(v)} format`,
  minimum: (v) => `at least ${String(v)}`,
  maximum: (v) => `at most ${String(v)}`,
  multipleOf: (v) => `a multiple of ${String(v)}`,
  $schema: () => null,
};

/** One schema node's description, with what its dropped keywords said appended. */
const describedBy = (
  node: Record<string, unknown>,
  said: readonly string[],
): string | undefined => {
  const existing = typeof node['description'] === 'string' ? node['description'] : '';
  if (said.length === 0) return existing === '' ? undefined : existing;
  const sizes = said.join(', ');
  return existing === '' ? sizes : `${existing} (${sizes})`;
};

/**
 * The schema with every keyword the subset refuses turned into words, and
 * `oneOf` read as `anyOf` — the subset takes one and not the other, and for a
 * closed set of variants they say the same thing.
 *
 * A deep copy: the caller's schema is the one the zod parse still enforces,
 * and nothing here may reach it.
 */
export function strictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(schema) as Record<string, unknown>;
  walkJsonSchema(copy, '', (node) => {
    const said: string[] = [];
    for (const [keyword, say] of Object.entries(UNSUPPORTED_KEYWORDS)) {
      if (!(keyword in node)) continue;
      const words = say(node[keyword]);
      if (words !== null) said.push(words);
      delete node[keyword];
    }
    const description = describedBy(node, said);
    if (description !== undefined) node['description'] = description;
    if (Array.isArray(node['oneOf'])) {
      node['anyOf'] = node['oneOf'];
      delete node['oneOf'];
    }
  });
  return copy;
}
