/**
 * Reciprocal-rank fusion over the ranked lists a batch of probes came back
 * with. Rank-based on purpose: the lists are answers to different questions
 * against different named vectors, so their scores are not on one scale and
 * comparing them directly would let whichever probe happens to score high
 * decide the whole list. A chunk two probes both rank well beats one that a
 * single probe ranks first. Deduped on `contentHash`, so the same lesson
 * stored by two runs takes one slot, keeping its best-scoring copy.
 */
import type { MemoryHit } from '../ports';
import { probeOf, type FusedHit } from './query';

/** How much a rank-k hit is worth; the constant of the standard RRF. */
const RRF_K = 60;

export function fuse(ranked: readonly (readonly MemoryHit[])[], limit: number): FusedHit[] {
  const scores = new Map<string, number>();
  const best = new Map<string, MemoryHit>();
  const probes = new Map<string, Set<number>>();
  ranked.forEach((list, listIndex) => {
    const probe = probeOf(listIndex);
    list.forEach((hit, rank) => {
      scores.set(hit.contentHash, (scores.get(hit.contentHash) ?? 0) + 1 / (RRF_K + rank + 1));
      const incumbent = best.get(hit.contentHash);
      if (incumbent === undefined || hit.score > incumbent.score) best.set(hit.contentHash, hit);
      const seenBy = probes.get(hit.contentHash) ?? new Set<number>();
      seenBy.add(probe);
      probes.set(hit.contentHash, seenBy);
    });
  });
  return [...scores.entries()]
    .sort(([leftHash, left], [rightHash, right]) =>
      right === left ? leftHash.localeCompare(rightHash) : right - left,
    )
    .slice(0, limit)
    .flatMap(([hash]) => {
      const hit = best.get(hash);
      return hit ? [{ ...hit, probes: [...(probes.get(hash) ?? [])].sort((a, b) => a - b) }] : [];
    });
}
