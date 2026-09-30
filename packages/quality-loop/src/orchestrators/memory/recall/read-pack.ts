/**
 * What a recall endorses, read from the memory-recall run's own outputs:
 * kept chunks no confirmed finding names, strongest support first. A run the
 * policy would not admit endorses nothing. Over engine facts — the artifact,
 * the ledger — never over prose.
 */
import type { EvidenceLedger } from '@sysdesign/contracts';

import { admits, type RunOutputs } from '../../../core/outputs';
import { alias } from '../../../pipelines/memory-recall/input';
import { memoryPackSchema, type MemoryPack } from '../../../pipelines/memory-recall/output';
import type { MemoryHit } from '../ports';

export interface UsableMemory {
  alias: string;
  kept: MemoryPack['kept'][number];
  hit: MemoryHit;
  /** How many passing criteria cited the chunk as evidence. */
  support: number;
}

export interface RecallReadout {
  /** Whether the run cleared `admits` at all; false means nothing was even considered. */
  admitted: boolean;
  /** How many chunks the pack kept, faulted or not. */
  kept: number;
  usable: UsableMemory[];
}

/** Every location a confirmed finding points at: what the curator faulted. */
const faultedRefs = (ledger: EvidenceLedger): Set<string> =>
  new Set(ledger.findings.flatMap((finding) => finding.locationRefs));

/** How many passing criteria cite a location as their evidence. */
const supportIn =
  (ledger: EvidenceLedger) =>
  (id: string): number =>
    ledger.criteria.filter(
      (evidence) => evidence.result === 'pass' && evidence.locationRefs.includes(id),
    ).length;

export function readPack(
  outputs: RunOutputs,
  hits: readonly MemoryHit[],
  acceptAt: number,
): RecallReadout {
  const { best } = outputs;
  const pack = best === null ? null : memoryPackSchema.safeParse(best.artifact);
  if (best === null || !pack?.success) return { admitted: false, kept: 0, usable: [] };
  const kept = pack.data.kept.length;
  if (!admits(outputs, acceptAt)) return { admitted: false, kept, usable: [] };
  const faulted = faultedRefs(best.ledger);
  const supportOf = supportIn(best.ledger);
  const byAlias = new Map(hits.map((hit, position) => [alias(position), hit]));
  const usable = pack.data.kept
    .filter((item) => !faulted.has(item.chunk))
    .flatMap((item) => {
      const hit = byAlias.get(item.chunk);
      return hit ? [{ alias: item.chunk, kept: item, hit, support: supportOf(item.chunk) }] : [];
    })
    .sort((a, b) => b.support - a.support);
  return { admitted: true, kept, usable };
}
