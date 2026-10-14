import {
  LEAD_TIERS,
  type Lead,
  type LeadTier,
  type PullWindow,
  type SearchYield,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { SliceRun } from './pull';

const count = z.number().int().min(0);

/**
 * A stored yield as it must still be before it is shown: refused, never
 * trusted. Checked against the wire type, so the two cannot drift.
 */
export const searchYieldSchema = z.strictObject({
  at: z.string().min(1),
  window: z.strictObject({ from: z.string().min(1), to: z.string().min(1) }),
  received: count,
  inserted: count,
  truncated: z.boolean(),
  tiers: z.strictObject(
    Object.fromEntries(LEAD_TIERS.map((tier) => [tier, count])) as Record<LeadTier, typeof count>,
  ),
  unlisted: count,
}) satisfies z.ZodType<SearchYield>;

/** The stored value as a yield, or null: absent, or something the schema refuses. */
export const readYield = (stored: unknown): SearchYield | null => {
  const parsed = searchYieldSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
};

/**
 * What one slice brought in, as the evidence its search is judged on: what
 * the source returned, how much of it the store had not seen, and how the
 * profile ranks the notices it carried — by tier for the ones its leads
 * list shows, counted together for the ones a gate keeps off it. `ranked`
 * is that list's ranking of the carried notices, by notice id. A slice that
 * read no page — answered from the cache window, skipped, refused — has no
 * yield: null, so the one from its last read stands.
 */
export function yieldOf(
  run: SliceRun,
  ranked: ReadonlyMap<string, Lead>,
  window: PullWindow,
  at: Date,
): SearchYield | null {
  if (run.report.pages === 0) return null;
  const tiers = Object.fromEntries(LEAD_TIERS.map((tier) => [tier, 0])) as Record<LeadTier, number>;
  let unlisted = 0;
  for (const noticeId of new Set(run.noticeIds)) {
    const tier = ranked.get(noticeId)?.tier ?? null;
    if (tier === null) unlisted += 1;
    else tiers[tier] += 1;
  }
  return {
    at: at.toISOString(),
    window,
    received: run.report.received,
    inserted: run.report.inserted,
    truncated: run.report.truncated,
    tiers,
    unlisted,
  };
}
