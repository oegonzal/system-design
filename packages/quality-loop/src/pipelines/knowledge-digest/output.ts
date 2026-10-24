/**
 * The knowledge digest: what a finished run was found to teach, one typed item
 * at a time, each resting on the findings and criteria that show it, and every
 * other evidence alias under `unused`.
 *
 * The item shape is the one the memory store consumes — `evidence`, `insight`,
 * `appliesWhen` — so an item is stored as the digest wrote it and the generic
 * reader needs no widening. What this digest adds beside those is what a reader
 * of the store uses to tell items apart: the kind, the dimension the evidence
 * lands on, the topics to search by, and the already-known items this run's
 * evidence confirms or contradicts.
 *
 * A location is a PLACE in the digest — the summary, each item, each unused
 * slot — never an item's citation, which is the lesson the experience digest
 * learned the hard way: with citations as locations, the normaliser's overlap
 * grouping chained two items' findings through a shared alias, and admission
 * dropped items nothing had faulted. A finding is located at the one item it
 * faults and names the aliases in its rationale.
 *
 * Nothing here is a number. `polarity` and `grounding` are derived from the
 * kind and from the evidence's own transitions, not written, because a slot a
 * model fills needs a rule to check it and both are functions of facts already
 * recorded.
 */
import {
  KNOWLEDGE_ITEM_KINDS,
  type KnowledgeItemKind,
  type KnowledgePolarity,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { section, type OutputShape } from '../../core/contracts';
import { ALIAS_MAX, MAX_EVIDENCE } from '../../core/outputs';
import { MAX_ITEMS, MAX_TOPICS, TOPIC_MAX } from './input';

/**
 * Whether an item tells a reader to do something or to avoid it. A function of
 * the kind, so the producer is never asked for it and no rule has to check it;
 * a fact tells a reader what is true and neither.
 */
export const polarityOf = (kind: KnowledgeItemKind): KnowledgePolarity | null =>
  (({ fact: null, anti_pattern: 'avoid', pattern: 'do', procedure: 'do' }) as const)[kind];

const alias = z.string().min(1).max(ALIAS_MAX).describe('An alias exactly as listed.');

export const knowledgeDigestSchema = z.strictObject({
  summary: z
    .string()
    .min(1)
    .max(950)
    .describe('What this run adds to what was already known, in 2–4 sentences.'),
  memories: z
    .array(
      z.strictObject({
        kind: z.enum(KNOWLEDGE_ITEM_KINDS).describe('Which kind of knowledge this item is.'),
        evidence: z
          .array(alias)
          .min(1)
          .max(8)
          .describe(
            'The findings and criteria this item rests on; an alias may back several items.',
          ),
        insight: z
          .string()
          .min(1)
          .max(1000)
          .describe(
            "The knowledge, in terms another prompt could use — no alias, location id, iteration number, or this run's own names and figures.",
          ),
        appliesWhen: z
          .string()
          .min(1)
          .max(500)
          .describe('The situation that calls for it, written as a situation.'),
        dimension: z
          .string()
          .min(1)
          .max(40)
          .describe(
            'Exactly one of the dimensions listed under Limits: the dimension one of this item’s cited aliases lands on.',
          ),
        topics: z
          .array(z.string().min(1).max(TOPIC_MAX))
          .max(MAX_TOPICS)
          .describe('General words a reader would search by; never a name from this design.'),
        confirms: z
          .array(alias)
          .max(4)
          .describe(
            'Known aliases this item’s evidence supports; such an item reinforces what is stored, and is not stored again.',
          ),
        contradicts: z
          .array(alias)
          .max(4)
          .describe('Known aliases this item’s evidence shows to be wrong here.'),
      }),
    )
    .max(MAX_ITEMS),
  unused: z
    .array(alias)
    .max(MAX_EVIDENCE)
    .describe('Every listed evidence alias no item rests on.'),
});
export type KnowledgeDigest = z.infer<typeof knowledgeDigestSchema>;
export type KnowledgeItem = KnowledgeDigest['memories'][number];

/** The place of the item at `position` (zero-based) — where a finding about it is located. */
export const itemLocation = (position: number): string => `memory.${position + 1}`;

const cited = (aliases: readonly string[]): string => aliases.map((id) => `[${id}]`).join(' ');

const against = (item: KnowledgeItem): string =>
  [
    item.confirms.length > 0 ? `confirms ${cited(item.confirms)}` : null,
    item.contradicts.length > 0 ? `contradicts ${cited(item.contradicts)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

export const knowledgeDigestOutput: OutputShape<KnowledgeDigest> = {
  schema: knowledgeDigestSchema,

  locate: (digest) => [
    { id: 'summary', label: 'Summary' },
    ...digest.memories.map((item, index) => ({
      id: itemLocation(index),
      label: `${item.kind} — ${item.insight}`,
    })),
    ...digest.unused.map((id) => ({ id, label: 'unused' })),
  ],

  render: (digest) =>
    [
      `[summary] ${digest.summary}`,
      ...section(
        'Knowledge',
        digest.memories.map((item, index) => {
          const parts = [
            item.kind,
            item.dimension,
            item.topics.length > 0 ? `topics: ${item.topics.join(', ')}` : null,
            `on ${cited(item.evidence)}`,
            against(item) === '' ? null : against(item),
          ].filter((part): part is string => part !== null);
          return `[${itemLocation(index)}] ${parts.join(' · ')}: ${item.insight} — applies when ${item.appliesWhen}`;
        }),
      ),
      ...section('Unused', digest.unused.length > 0 ? [cited(digest.unused)] : []),
    ].join('\n'),
};
