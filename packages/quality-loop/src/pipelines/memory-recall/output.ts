/**
 * The memory pack: one verdict per candidate, the insight a kept chunk lends
 * the query, and the needs nothing serves. Kept and dropped chunks are
 * addressed by their candidate alias, so a finding about a chunk keeps its
 * key across revisions and maps straight back to the source.
 */
import { bound, bounded, exact } from '@sysdesign/contracts';
import { z } from 'zod';

import { section, type OutputShape } from '../../core/contracts';
import { ALIAS_MAX, MAX_CANDIDATES, MAX_FOCUS, MAX_KEPT } from './input';

/*
 * What the curator is asked for, each above what it has measurably written
 * (`measured.json`, every recorded pack to 2026-10-30): the summary's
 * longest was 1,109 characters (p99 1,105), a `serves` 271 (191), an insight
 * 575 (497), a caveat 459 (308), a drop's reason 339 (269), a gap 349 (219),
 * and at most 9 gaps. The two verdict lists are the query's own counts —
 * at most the kept limit, one per candidate — so they are exact, and so is
 * what a kept chunk cites: at most every defect the query lists.
 */
const SUMMARY_BOUND = bound(1200);
const SERVES_BOUND = bound(230);
const INSIGHT_BOUND = bound(720);
const CAVEAT_BOUND = bound(380);
const REASON_BOUND = bound(320);
const GAP_BOUND = bound(290);
const GAPS_BOUND = bound(10, 'list');
const KEPT_BOUND = exact(MAX_KEPT);
const DROPPED_BOUND = exact(MAX_CANDIDATES);
const CITES_BOUND = exact(MAX_FOCUS);

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
        description: 'The part of the query this chunk informs, in words — no label.',
      }),
      cites: bounded.list(
        CITES_BOUND,
        bounded.id(ALIAS_MAX, { min: 1, description: 'A defect label exactly as listed.' }),
        {
          description:
            'The defects listed under What is wrong now that this chunk bears on; empty when the query lists none or it bears on none.',
        },
      ),
      insight: bounded.text(INSIGHT_BOUND, {
        min: 1,
        description:
          "What the chunk teaches for this query, in the chunk's own terms — nothing the chunk does not say, and no label of the query.",
      }),
      caveat: bounded
        .text(CAVEAT_BOUND, {
          description:
            "How the chunk's context differs from the query, in words with no label of the query, or null.",
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
            `[${item.chunk}] keep — serves: ${item.serves}${item.cites.length > 0 ? `; cites: ${item.cites.join(', ')}` : ''}; insight: ${item.insight}${item.caveat ? `; caveat: ${item.caveat}` : ''}`,
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
