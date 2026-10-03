/**
 * The screen a recall for a producer that revises a judged answer runs after
 * fusion: what that producer already holds is not news, so a stored lesson
 * digested from the chain the answer descends from, or from a copy of it, or
 * resting only on findings the producer holds, is set aside before the
 * curator spends a slot on it — and recorded with the rule and what it
 * matched. Twins resting on the same evidence of one prompt take one slot.
 * Every rule reads stored facts — the source, the lineage, the evidence keys —
 * and none reads a lesson's text. A recall over the goal alone never comes
 * here.
 */
import type {
  AdoptedIterationRef,
  RecallExclusionReason,
  RecallNoveltyDto,
  RecallOrigin,
  RecallScreenAction,
  RecallScreenedDto,
} from '@sysdesign/contracts';

import { alias } from '../../../pipelines/memory-recall/input';
import type { MemoryHit } from '../ports';
import type { RecallKnown } from './known';
import { linkLabel } from './lineage';
import type { FusedHit } from './query';

/**
 * How much wider a screened recall searches than it offers. In the recorded
 * coach recall that motivated the screen, 10 of the 16 candidates were copies
 * of what the producer held; three times the slots leaves room for as many
 * lessons that are not.
 */
export const POOL_FACTOR = 3;

/**
 * What each reason does to a lesson it matches — one declared table, so a
 * reason can turn from setting a lesson aside to ranking it last, still
 * offered, in one line once the recorded exclusions say it should.
 */
export const EXCLUSION_POLICY = {
  'chain-iteration': 'exclude',
  'sibling-copy': 'exclude',
  'known-evidence': 'exclude',
} as const satisfies Record<RecallExclusionReason, RecallScreenAction>;

/** A hit the screen offers, placed against what the producer holds. */
export interface PlacedHit extends FusedHit {
  origin: RecallOrigin;
}

/** What the screen did with a pool: the offered hits, each with its origin, and the rest by reason. */
export interface Screened {
  offered: PlacedHit[];
  excluded: RecallScreenedDto[];
  demoted: RecallScreenedDto[];
  /** Twins folded into the hit they rest on the same evidence with. */
  collapsed: number;
}

interface Match {
  reason: RecallExclusionReason;
  matched: string[];
}

const sameLink = (a: AdoptedIterationRef, b: AdoptedIterationRef): boolean =>
  a.runId === b.runId && a.iteration === b.iteration;

/** The finding keys a lesson rests on; criterion ids are rubric-local and never compared across runs. */
const findingRefs = (hit: MemoryHit): string[] =>
  hit.evidence.filter((ref) => ref.kind === 'finding').map((ref) => ref.ref);

/**
 * Of the same prompt, as far as the store can say: a lesson that records its
 * goal hash is kin only by it; one stored before lineage was recorded is kin
 * by pipeline alone — the most a legacy point says until a re-index.
 */
const kinOf = (hit: MemoryHit, known: RecallKnown): boolean =>
  hit.source.pipeline === known.pipeline &&
  (hit.lineage === null || hit.lineage.goalHash === known.goalHash);

/** The first rule a lesson matches, with what it matched; null when it brings something the producer does not hold. */
export function matchOf(hit: MemoryHit, known: RecallKnown): Match | null {
  const linked = known.chain.find((link) => link.runId === hit.source.runId);
  if (linked !== undefined && hit.source.iteration <= linked.iteration) {
    return { reason: 'chain-iteration', matched: [linkLabel(linked)] };
  }
  const judged = hit.lineage?.judged;
  const copied =
    judged === undefined ? undefined : known.chain.find((link) => sameLink(link, judged));
  if (copied !== undefined) return { reason: 'sibling-copy', matched: [linkLabel(copied)] };
  const refs = findingRefs(hit);
  if (kinOf(hit, known) && refs.length > 0 && refs.every((ref) => known.findings.has(ref))) {
    return { reason: 'known-evidence', matched: refs };
  }
  return null;
}

/** Where a lesson was learned relative to the answer the producer revises. */
export function originOf(hit: MemoryHit, known: RecallKnown): RecallOrigin {
  if (known.chain.some((link) => link.runId === hit.source.runId)) return 'chain';
  if (hit.lineage !== null && hit.lineage.goalHash === known.goalHash) return 'same-prompt';
  return hit.source.pipeline === known.pipeline ? 'same-pipeline' : 'other-pipeline';
}

/**
 * What makes two lessons twins: the same evidence keys of the same prompt,
 * digested by different runs — a copy's digest beside the original's. Keys
 * are local to the ledger they name, so a lesson that records no goal hash,
 * or cites nothing, has no twin; two lessons one run drew from the same
 * evidence are two lessons.
 */
const twinKey = (hit: MemoryHit): string | null => {
  if (hit.lineage === null || hit.evidence.length === 0) return null;
  const keys = hit.evidence.map((ref) => `${ref.kind}:${ref.ref}`).sort();
  return JSON.stringify([hit.lineage.goalHash, ...keys]);
};

/** One slot per twin set, kept by its best-fused member, with every twin's probes folded in. */
function collapse(hits: readonly FusedHit[]): { kept: FusedHit[]; collapsed: number } {
  const kept: FusedHit[] = [];
  const slotOf = new Map<string, number>();
  for (const hit of hits) {
    const key = twinKey(hit);
    const slot = key === null ? undefined : slotOf.get(key);
    const twin = slot === undefined ? undefined : kept[slot];
    if (slot === undefined || twin === undefined || twin.source.runId === hit.source.runId) {
      if (key !== null && slot === undefined) slotOf.set(key, kept.length);
      kept.push(hit);
      continue;
    }
    const probes = [...new Set([...twin.probes, ...hit.probes])].sort((a, b) => a - b);
    kept[slot] = { ...twin, probes };
  }
  return { kept, collapsed: hits.length - kept.length };
}

const screenedOf = (hit: MemoryHit, { reason, matched }: Match): RecallScreenedDto => ({
  sourceRunId: hit.source.runId,
  ref: hit.source.ref,
  iteration: hit.source.iteration,
  reason,
  matched,
});

/** What a screen does per reason: the declared table, unless a caller states another. */
export type ExclusionPolicy = Readonly<Record<RecallExclusionReason, RecallScreenAction>>;

/**
 * The fused pool, in its order, screened against what the producer holds:
 * the first rule each lesson matches sets it aside or ranks it last, as the
 * policy says; the rest collapse by twin and lead. At most `limit` are
 * offered, each with its origin.
 */
export function screen(
  pool: readonly FusedHit[],
  known: RecallKnown,
  limit: number,
  policy: ExclusionPolicy = EXCLUSION_POLICY,
): Screened {
  const fresh: FusedHit[] = [];
  const last: FusedHit[] = [];
  const excluded: RecallScreenedDto[] = [];
  const demoted: RecallScreenedDto[] = [];
  for (const hit of pool) {
    const match = matchOf(hit, known);
    if (match === null) {
      fresh.push(hit);
    } else if (policy[match.reason] === 'exclude') {
      excluded.push(screenedOf(hit, match));
    } else {
      demoted.push(screenedOf(hit, match));
      last.push(hit);
    }
  }
  const { kept, collapsed } = collapse(fresh);
  const offered = [...kept, ...last]
    .slice(0, limit)
    .map((hit) => ({ ...hit, origin: originOf(hit, known) }));
  return { offered, excluded, demoted, collapsed };
}

/** The record of a screen: the chain, what was held, and what became of the pool. */
export function noveltyOf(known: RecallKnown, pool: number, screened: Screened): RecallNoveltyDto {
  return {
    chain: [...known.chain],
    known: {
      findings: known.findings.size,
      criteria: known.criteria.size,
      remediations: known.remediations.length,
    },
    pool,
    collapsed: screened.collapsed,
    offered: screened.offered.length,
    excluded: screened.excluded,
    demoted: screened.demoted,
    origins: screened.offered.map((hit, position) => ({
      ref: alias(position),
      sourceRunId: hit.source.runId,
      origin: hit.origin,
    })),
  };
}
