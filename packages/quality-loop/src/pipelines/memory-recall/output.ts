/**
 * The memory pack: one verdict per candidate, the insight a kept chunk lends
 * the query, and the needs nothing serves. Kept and dropped chunks are
 * addressed by their candidate alias, so a finding about a chunk keeps its
 * key across revisions and maps straight back to the source.
 */
import { bound, bounded, exact } from '@sysdesign/contracts';
import { z } from 'zod';

import { section, type OutputShape } from '../../core/contracts';
import { ALIAS_MAX, MAX_CANDIDATES, MAX_KEPT } from './input';

/*
 * What the curator is asked for, each above what it has measurably written
 * (`measured.json`, every recorded pack to 2026-10-02): the summary's
 * longest was 907 characters (p99 842), a `serves` 163 (140), an insight 575
 * (489), a caveat 277 (250), a drop's reason 290 (230), a gap 224 (187),
 * and at most 9 gaps. The two verdict lists are the query's own counts —
 * at most the kept limit, one per candidate — so they are exact.
 */
const SUMMARY_BOUND = bound(1100);
const SERVES_BOUND = bound(200);
const INSIGHT_BOUND = bound(720);
const CAVEAT_BOUND = bound(340);
const REASON_BOUND = bound(320);
const GAP_BOUND = bound(250);
const GAPS_BOUND = bound(10, 'list');
const KEPT_BOUND = exact(MAX_KEPT);
const DROPPED_BOUND = exact(MAX_CANDIDATES);

const chunk = bounded.id(ALIAS_MAX, {
  min: 1,
  description: 'The candidate alias exactly as listed.',
});

export const memoryPackSchema = z.strictObject({
  summary: bounded.text(SUMMARY_BOUND, {
    min: 1,
    description:
      'What the query needs from memory and what the candidates offer, in 2–4 sentences.',
  }),
  kept: bounded.list(
    KEPT_BOUND,
    z.strictObject({
      chunk,
      serves: bounded.text(SERVES_BOUND, {
        min: 1,
        description: 'The part of the query this chunk informs.',
      }),
      insight: bounded.text(INSIGHT_BOUND, {
        min: 1,
        description:
          "What the chunk teaches for this query, in the chunk's own terms — nothing the chunk does not say.",
      }),
      caveat: bounded
        .text(CAVEAT_BOUND, {
          description: "How the chunk's context differs from the query, or null.",
        })
        .nullable(),
    }),
  ),
  dropped: bounded.list(
    DROPPED_BOUND,
    z.strictObject({ chunk, reason: bounded.text(REASON_BOUND, { min: 1 }) }),
  ),
  gaps: bounded.list(GAPS_BOUND, bounded.text(GAP_BOUND, { min: 1 }), {
    description: 'Needs of the query no candidate serves.',
  }),
});
export type MemoryPack = z.infer<typeof memoryPackSchema>;

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
