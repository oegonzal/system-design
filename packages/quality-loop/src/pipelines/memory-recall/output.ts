/**
 * The memory pack: one verdict per candidate, the insight a kept chunk lends
 * the query, and the needs nothing serves. Kept and dropped chunks are
 * addressed by their candidate alias, so a finding about a chunk keeps its
 * key across revisions and maps straight back to the source.
 */
import { z } from 'zod';

import type { OutputShape } from '../../core/contracts';
import { MAX_CANDIDATES, MAX_KEPT } from './input';

const chunk = z.string().min(1).max(8).describe('The candidate alias exactly as listed.');

export const memoryPackSchema = z.strictObject({
  summary: z
    .string()
    .min(1)
    .max(500)
    .describe('What the query needs from memory and what the candidates offer, in 2–4 sentences.'),
  kept: z
    .array(
      z.strictObject({
        chunk,
        serves: z.string().min(1).max(200).describe('The part of the query this chunk informs.'),
        insight: z
          .string()
          .min(1)
          .max(400)
          .describe(
            "What the chunk teaches for this query, in the chunk's own terms — nothing the chunk does not say.",
          ),
        caveat: z
          .string()
          .max(200)
          .nullable()
          .describe("How the chunk's context differs from the query, or null."),
      }),
    )
    .max(MAX_KEPT),
  dropped: z
    .array(z.strictObject({ chunk, reason: z.string().min(1).max(200) }))
    .max(MAX_CANDIDATES),
  gaps: z
    .array(z.string().min(1).max(200))
    .max(10)
    .describe('Needs of the query no candidate serves.'),
});
export type MemoryPack = z.infer<typeof memoryPackSchema>;

const section = (title: string, lines: readonly string[]): string[] =>
  lines.length === 0 ? [] : ['', `## ${title}`, ...lines];

export const memoryPackOutput: OutputShape<MemoryPack> = {
  schema: memoryPackSchema,

  locate: (pack) => [
    { id: 'summary', label: 'Summary' },
    ...pack.kept.map((item) => ({ id: item.chunk, label: `kept — ${item.serves}` })),
    ...pack.dropped.map((item) => ({ id: item.chunk, label: `dropped — ${item.reason}` })),
    ...pack.gaps.map((gap, index) => ({ id: `gap.${index + 1}`, label: gap })),
  ],

  render: (pack) =>
    [
      `[summary] ${pack.summary}`,
      ...section(
        'Kept',
        pack.kept.map(
          (item) =>
            `[${item.chunk}] keep — serves: ${item.serves}; insight: ${item.insight}${item.caveat ? `; caveat: ${item.caveat}` : ''}`,
        ),
      ),
      ...section(
        'Dropped',
        pack.dropped.map((item) => `[${item.chunk}] drop — ${item.reason}`),
      ),
      ...section(
        'Gaps',
        pack.gaps.map((gap, index) => `[gap.${index + 1}] ${gap}`),
      ),
    ].join('\n'),
};
