/**
 * The chain an adopted answer descends from: the iteration a run starts
 * from, then the iteration that iteration's own run had adopted, and so on.
 * A run that adopts copies the ledger it adopts verbatim, so every lesson
 * digested from any link of the chain may restate what the producer already
 * holds. Walked through a lookup the caller supplies — the runs it records —
 * so this stays pure of persistence.
 */
import type { AdoptedIterationRef } from '@sysdesign/contracts';

/** Recorded chains run one to three links; a longer one is a loop the walk must not follow forever. */
export const MAX_LINEAGE_DEPTH = 8;

/** What a run adopted, by its id — null when it adopted nothing, or is not recorded. */
export type AdoptionLookup = (runId: string) => Promise<AdoptedIterationRef | null>;

/**
 * `base` first, then what its run adopted (`first`, already in hand), then
 * what each link's run adopted in turn — stopping at a run that adopted
 * nothing, at one already walked, or at the depth.
 */
export async function resolveLineage(
  base: AdoptedIterationRef,
  first: AdoptedIterationRef | null,
  lookup: AdoptionLookup,
): Promise<AdoptedIterationRef[]> {
  const chain: AdoptedIterationRef[] = [base];
  const walked = new Set([base.runId]);
  let next = first;
  while (next !== null && chain.length < MAX_LINEAGE_DEPTH && !walked.has(next.runId)) {
    chain.push(next);
    walked.add(next.runId);
    next = await lookup(next.runId);
  }
  return chain;
}
