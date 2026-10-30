import {
  WRITE_OUTCOMES,
  type AppliedDigestDto,
  type DigestDto,
  type DigestItemDto,
  type MemoryRefusalDto,
} from '@sysdesign/contracts';

import type { ManifestStep, PostingOutcome } from '../../core/ports';

/**
 * A digest as the host reads it back, as a posting's outcome. The digest step
 * is the host's own record of the register-memory run; the store step is the
 * sink's apply — what each endorsed memory's write did, counted — or why it
 * did not run, in the store step's own declared reasons. What the posting
 * stored is the records the apply answered, so a retraction can name each.
 */

/** Whether the digest left memories to remember: settled complete, its step complete, and a report endorsing at least one. */
export const endorsesMemories = (digest: DigestDto): boolean =>
  digest.status === 'complete' &&
  digest.step.status === 'complete' &&
  (digest.report?.endorsed.length ?? 0) > 0;

type RefusedItem = Extract<DigestItemDto, { refusal: MemoryRefusalDto }>;

const refusedItem = (item: DigestItemDto): item is RefusedItem => item.refusal !== null;

/** What an apply did: how many memories, each write outcome counted, and the refusals apart. */
function applyCounts(applied: AppliedDigestDto): Record<string, number> {
  const counts: Record<string, number> = { items: applied.items.length, refused: 0 };
  for (const outcome of WRITE_OUTCOMES) counts[outcome] = 0;
  for (const item of applied.items) {
    const key = item.outcome ?? 'refused';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** A step that did not run: skipped, for a declared reason of the store step's own. */
const skipped = (reason: ManifestStep['reason']): ManifestStep => ({
  status: 'skipped',
  reason,
  note: null,
  counts: {},
});

/**
 * The store step as the sink's apply went — or did not: null while the digest
 * has not settled complete, since nothing was there to apply; skipped when the
 * digest left nothing to apply, or settled with memories that were never
 * applied; complete once applied, with a reason when the runtime refused any
 * of the endorsed memories, so the chunk's facts are not all in the store.
 */
function storeStepOf(digest: DigestDto): ManifestStep | null {
  if (digest.status !== 'complete') return null;
  if (!endorsesMemories(digest)) return skipped('nothing-endorsed');
  if (digest.applied === null) return skipped('not-applied');
  const refused = digest.applied.items.filter(refusedItem);
  return {
    status: 'complete',
    reason: refused.length === 0 ? null : 'items-refused',
    note:
      refused.length === 0
        ? null
        : refused.map((item) => `${item.ref}: ${item.refusal.code}`).join(', '),
    counts: applyCounts(digest.applied),
  };
}

/** Why a failed digest failed, as its step noted it; the run named when the step said nothing. */
const errorOf = (digest: DigestDto): string | null =>
  digest.status === 'failed'
    ? (digest.step.note ?? `digest ${digest.orchestrationRunId} failed`)
    : null;

export const outcomeOf = (digest: DigestDto): PostingOutcome => ({
  orchestrationRunId: digest.orchestrationRunId,
  status: digest.status,
  digestRunId: digest.digestRunId,
  steps: { digest: digest.step, store: storeStepOf(digest) },
  error: errorOf(digest),
  recordIds:
    digest.applied?.items.flatMap((item) => (item.recordId === null ? [] : [item.recordId])) ?? [],
});
