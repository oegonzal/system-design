/**
 * A memory policy: the numbers a strategy's prose cannot carry — how long a
 * term lives, how a recall is weighted and budgeted, how much independent
 * support a lesson needs and a playbook more. Declared data, validated where it
 * is read, and kept by a space as the snapshot it was created under. The
 * refinements sit on the nested objects so a host can extend the whole.
 */
import { MEMORY_FIELD_NAME, type MemoryTerm } from '@sysdesign/contracts';
import { z } from 'zod';

/** Which terms must expire: short-term memory is the state of a task in flight, never durable memory. */
export const TERM_MUST_EXPIRE = {
  short_term: true,
  long_term: false,
} as const satisfies Record<MemoryTerm, boolean>;

const term = z.strictObject({ ttlSeconds: z.number().int().min(1).nullable() });
const weight = z.number().min(0);

export const memoryPolicySchema = z.strictObject({
  /** The scope keys a request may name; the first is the partition every request and record carries. */
  scopeKeys: z
    .array(z.string().regex(MEMORY_FIELD_NAME))
    .min(1)
    .refine((keys) => new Set(keys).size === keys.length, 'the scope keys are distinct'),
  terms: z
    .strictObject({ short_term: term, long_term: term })
    .refine(
      (terms) =>
        (Object.keys(TERM_MUST_EXPIRE) as MemoryTerm[]).every(
          (name) => !TERM_MUST_EXPIRE[name] || terms[name].ttlSeconds !== null,
        ),
      'a term that must expire declares a TTL',
    ),
  recall: z.strictObject({
    maxItems: z.number().int().min(1),
    maxChars: z.number().int().min(1),
    weights: z
      .strictObject({ similarity: weight, exact: weight, recency: weight, support: weight })
      .refine(
        (weights) => weights.similarity + weights.exact + weights.recency + weights.support > 0,
        'some weight is positive',
      ),
    recencyHalfLifeDays: z.number().positive(),
  }),
  consolidation: z
    .strictObject({ minSupport: z.number().int().min(1), promoteAt: z.number().int().min(1) })
    .refine(
      (consolidation) => consolidation.promoteAt >= consolidation.minSupport,
      'a playbook needs at least the support a lesson needs',
    ),
});
export type MemoryPolicy = z.infer<typeof memoryPolicySchema>;
