/**
 * What a recall endorses, read from the memory-recall run's own outputs:
 * kept chunks no confirmed finding names, strongest support first. A run the
 * policy would not admit endorses nothing. Over engine facts — the artifact,
 * the ledger — never over prose.
 */
import type { EvidenceLedger } from '@sysdesign/contracts';

import { admission, type Admission, type RunOutputs } from '../../../core/outputs';
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
  /** What `admission` said of the run; anything but `admitted` means no chunk was even considered. */
  admission: Admission;
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
  const kept = pack?.success ? pack.data.kept.length : 0;
  const verdict = admission(outputs, acceptAt);
  if (verdict !== 'admitted') return { admission: verdict, kept, usable: [] };
  // Admitted, yet not a pack this reader can resolve: nothing of it is drawn on.
  if (best === null || !pack?.success) return { admission: 'fell-short', kept, usable: [] };
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
  return { admission: 'admitted', kept, usable };
}
