/**
 * What a recall endorses, read from the memory-recall run's own outputs:
 * kept chunks nothing confirmed against them withholds, strongest support
 * first — withheld as the memory-recall pipeline declares each finding type
 * withholds (`withheldItems`): a chunk confirmed irrelevant, unsupported or
 * only restating what the producer holds is withheld, a redundant pair keeps
 * its better half, and a gap that names a chunk withholds nothing. A run the
 * policy would not admit endorses nothing. Over engine facts — the artifact,
 * the ledger — never over prose; the pack is read as the seam read the reply,
 * so one kept past a ceiling is drawn on rather than refused for its size.
 */
import { parseLenient, type SuccessCriterion } from '@sysdesign/contracts';

import {
  admission,
  supportIn,
  withheldItems,
  withheldRefs,
  withholdingOf,
  type Admission,
  type RunOutputs,
  type WithheldItem,
} from '../../../core/outputs';
import { MEMORY_RECALL } from '../../../pipelines/memory-recall/definition';
import { alias } from '../../../pipelines/memory-recall/input';
import { memoryPackSchema, type MemoryPack } from '../../../pipelines/memory-recall/output';
import type { MemoryHit } from '../ports';

export interface UsableMemory {
  alias: string;
  kept: MemoryPack['kept'][number];
  hit: MemoryHit;
  /** How many passing criteria cited the chunk as evidence. */
  support: number;
  /**
   * The rubric the recall run was judged against — the ids the curator's own
   * words cite its needs by, shared by every memory of one pack — so what it
   * wrote can be read back in the asker's terms (`provenance.ts`).
   */
  rubric: readonly SuccessCriterion[];
}

export interface RecallReadout {
  /** What `admission` said of the run; anything but `admitted` means no chunk was even considered. */
  admission: Admission;
  /** How many chunks the pack kept, faulted or not. */
  kept: number;
  usable: UsableMemory[];
  /** Each kept chunk withheld, with what withheld it; empty unless admitted. */
  withheld: WithheldItem[];
}

/** What each of the curator's finding types withholds, as its pipeline declares it. */
const WITHHOLDING = withholdingOf(MEMORY_RECALL.policy);

export function readPack(
  outputs: RunOutputs,
  hits: readonly MemoryHit[],
  acceptAt: number,
): RecallReadout {
  const { best } = outputs;
  const pack = best === null ? null : parseLenient(memoryPackSchema, best.artifact);
  const kept = pack?.ok ? pack.value.kept.length : 0;
  const verdict = admission(outputs, acceptAt);
  if (verdict !== 'admitted') return { admission: verdict, kept, usable: [], withheld: [] };
  // Admitted, yet not a pack this reader can resolve: nothing of it is drawn on.
  if (best === null || !pack?.ok) {
    return { admission: 'fell-short', kept, usable: [], withheld: [] };
  }
  const withheld = withheldItems(
    best.ledger,
    pack.value.kept.map((item) => item.chunk),
    WITHHOLDING,
  );
  const faulted = withheldRefs(withheld);
  const supportOf = supportIn(best.ledger);
  const rubric = outputs.trace.contract.criteria;
  const byAlias = new Map(hits.map((hit, position) => [alias(position), hit]));
  const usable = pack.value.kept
    .filter((item) => !faulted.has(item.chunk))
    .flatMap((item) => {
      const hit = byAlias.get(item.chunk);
      return hit
        ? [{ alias: item.chunk, kept: item, hit, support: supportOf(item.chunk), rubric }]
        : [];
    })
    .sort((a, b) => b.support - a.support);
  return { admission: 'admitted', kept, usable, withheld };
}
