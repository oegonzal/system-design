/**
 * The pure half of a memory run: what goes into the recall query, what comes
 * out of a recall or a digest, and how memory reaches a target's goal. Every
 * read-out is over engine facts (artifacts, ledgers, the codecs' indexes),
 * never over prose.
 */
import { createHash } from 'node:crypto';

import type { IterationTrace, RunTrace } from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import { GOAL_MAX_BYTES } from '../../core/prompting';
import { readIndex as readDigestIndex } from '../../pipelines/experience-digest/input';
import { experienceDigestSchema } from '../../pipelines/experience-digest/output';
import {
  alias,
  DEFAULT_RULES,
  MAX_CANDIDATES,
  MAX_KEPT,
  memoryQuerySchema,
  probeAlias,
  type ChunkSource,
  type MemoryQuery,
} from '../../pipelines/memory-recall/input';
import { memoryPackSchema, type MemoryPack } from '../../pipelines/memory-recall/output';
import { MAX_PROBES } from './query-probes';
import {
  VECTOR_NAMES,
  type EvidenceRef,
  type IndexedChunk,
  type MemoryHit,
  type MemoryProbe,
} from './ports';

/** The recall query is the goal's head: enough to embed and to judge candidates against. */
export const QUERY_MAX_BYTES = 16_000;

/** The marker the module writes; `bareGoal` strips from it, so nothing parses prose. */
export const MEMORY_HEADING = '## Remembered evidence (advisory)';
const MEMORY_LEAD =
  'Recalled from earlier runs by the memory loop and curated by the memory-recall pipeline. Context for the answer, not part of the prompt above: it states no requirement, and no success criterion may be derived from it. Prefer the prompt wherever they differ.';

export const contentHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export const queryText = (goal: string): string => capText(goal, QUERY_MAX_BYTES).text;

/** The goal as requested, without any memory a previous memory run appended. */
export function bareGoal(goal: string): string {
  const marker = goal.indexOf(`\n\n${MEMORY_HEADING}`);
  return marker < 0 ? goal : goal.slice(0, marker);
}

/**
 * The query the curator judges: the whole prompt, the candidates, and — for
 * each — the derived conditions it was retrieved under. `probes[0]` is the
 * prompt itself and is never listed, since "this came back on the prompt" is
 * not information.
 */
export function buildQuery(
  query: string,
  probes: readonly string[],
  hits: readonly FusedHit[],
): MemoryQuery {
  // `probes[0]` is the prompt; only the derived conditions are worth naming.
  const derived = probes.slice(1);
  return memoryQuerySchema.parse({
    query,
    rules: [...DEFAULT_RULES],
    probes: derived,
    maxKept: MAX_KEPT,
    candidates: hits.slice(0, MAX_CANDIDATES).map((hit) => ({
      text: hit.text,
      source: hit.source,
      matched: hit.probes.flatMap((index) =>
        index === 0 || derived[index - 1] === undefined ? [] : [probeAlias(index - 1)],
      ),
    })),
  });
}

/** A hit after fusion, with the probes that surfaced it. */
export interface FusedHit extends MemoryHit {
  /** Indices into the probe texts; 0 is the prompt itself. */
  probes: number[];
}

export interface UsableMemory {
  alias: string;
  kept: MemoryPack['kept'][number];
  hit: MemoryHit;
  /** How many passing criteria cited the chunk as evidence. */
  support: number;
}

export const bestIteration = (trace: RunTrace) =>
  trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ?? null;

/**
 * Whether a finished run's best iteration may be drawn on at all.
 *
 * An `accept` always may. Short of that, the loop's judgement is honoured
 * where it is item-specific — a faulted item is excluded by the caller — but a
 * run is not withheld wholesale merely because the iteration budget ran out
 * before someone else's blocker closed. `policyAllowed` is the one gate
 * deliberately not required: it is false whenever any blocker is open, and a
 * blocker on the summary would otherwise veto every memory beneath it. The
 * three gates that make the artifact and its score mean anything are required.
 */
export function admits(trace: RunTrace, best: IterationTrace, acceptAt: number): boolean {
  if (trace.finalDecision === 'accept') return true;
  const { gates, scores } = best.decision;
  if (!gates.artifactPresent || !gates.validatorsPassed || !gates.evidenceSufficient) return false;
  return scores.overall >= acceptAt;
}

export interface RecallReadout {
  /** Whether the run cleared `admits` at all; false means nothing was even considered. */
  admitted: boolean;
  /** How many chunks the pack kept, faulted or not. */
  kept: number;
  usable: UsableMemory[];
}

/**
 * What a recall endorses: kept chunks no confirmed finding names, strongest
 * support first. A run the policy would not admit endorses nothing.
 */
export function readPack(
  trace: RunTrace,
  hits: readonly MemoryHit[],
  acceptAt: number,
): RecallReadout {
  const best = bestIteration(trace);
  const pack = best === null ? null : memoryPackSchema.safeParse(best.artifact);
  if (best === null || !pack?.success) return { admitted: false, kept: 0, usable: [] };
  const kept = pack.data.kept.length;
  if (!admits(trace, best, acceptAt)) return { admitted: false, kept, usable: [] };
  const faulted = new Set(best.ledger.findings.flatMap((finding) => finding.locationRefs));
  const supportOf = (id: string): number =>
    best.ledger.criteria.filter(
      (evidence) => evidence.result === 'pass' && evidence.locationRefs.includes(id),
    ).length;
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

const rememberedLine = ({ alias: id, kept, hit }: UsableMemory): string => {
  const { source } = hit;
  const caveat = kept.caveat ? `; caveat: ${kept.caveat}` : '';
  return `- [${id}] ${source.kind} · run ${source.runId} · ${source.pipeline} · iteration ${source.iteration} · decided ${source.decision} · ${source.when} · ref ${source.ref}: ${hit.text} — serves: ${kept.serves}; insight: ${kept.insight}${caveat}`;
};

/**
 * The goal with memory appended, within the engine's goal budget: the
 * lowest-ranked items go first when it does not fit; a goal already at the
 * budget gets none. Null when nothing could be injected.
 */
export function withMemory(
  goal: string,
  usable: readonly UsableMemory[],
  budget = GOAL_MAX_BYTES,
): { goal: string; injected: number } | null {
  const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');
  if (usable.length === 0 || bytes(goal) >= budget) return null;
  for (let count = usable.length; count > 0; count -= 1) {
    const composed = [
      goal.trimEnd(),
      '',
      MEMORY_HEADING,
      '',
      MEMORY_LEAD,
      '',
      ...usable.slice(0, count).map(rememberedLine),
    ].join('\n');
    if (bytes(composed) <= budget) return { goal: composed, injected: count };
  }
  return null;
}

export interface MemoryToStore {
  position: number;
  insight: string;
  appliesWhen: string;
  evidence: EvidenceRef[];
}

export interface DigestReadout {
  /** Whether the run cleared `admits` at all; false means nothing was even considered. */
  admitted: boolean;
  /** How many memories the digest proposed, faulted or not. */
  proposed: number;
  memories: MemoryToStore[];
}









/** What a digest endorses: memories no confirmed finding names, with their evidence resolved. */
export function memoriesToStore(trace: RunTrace, acceptAt: number): DigestReadout {
  const best = bestIteration(trace);
  const digest = best === null ? null : experienceDigestSchema.safeParse(best.artifact);
  if (best === null || !digest?.success) return { admitted: false, proposed: 0, memories: [] };
  const proposed = digest.data.memories.length;
  const index = readDigestIndex(trace.contract.goal);
  if (index === null || !admits(trace, best, acceptAt)) {
    return { admitted: false, proposed, memories: [] };
  }
  const faulted = new Set(best.ledger.findings.flatMap((finding) => finding.locationRefs));
  const refOf = new Map(index.evidence.map((item) => [item.alias, item]));
  const memories = digest.data.memories.flatMap((memory, position) => {
    const id = `memory.${position + 1}`;
    if (faulted.has(id)) return [];
    const evidence = memory.evidence.flatMap((name) => {
      const item = refOf.get(name);
      return item ? [{ kind: item.kind, ref: item.ref }] : [];
    });
    return [
      {
        position: position + 1,
        insight: memory.insight,
        appliesWhen: memory.appliesWhen,
        evidence,
      },
    ];
  });
  return { admitted: true, proposed, memories };
}












export const lessonText = (memory: MemoryToStore): string =>
  `${memory.insight} — applies when ${memory.appliesWhen}`;

/** How much a rank-k hit is worth; the constant of the standard RRF. */
const RRF_K = 60;

/**
 * Reciprocal-rank fusion over the ranked lists a batch of probes came back
 * with. Rank-based on purpose: the lists are answers to different questions
 * against different named vectors, so their scores are not on one scale and
 * comparing them directly would let whichever probe happens to score high
 * decide the whole list. A chunk two probes both rank well beats one that a
 * single probe ranks first. Deduped on `contentHash`, so the same lesson
 * stored by two runs takes one slot, keeping its best-scoring copy.
 */
export function fuse(ranked: readonly (readonly MemoryHit[])[], limit: number): FusedHit[] {
  const scores = new Map<string, number>();
  const best = new Map<string, MemoryHit>();
  const probes = new Map<string, Set<number>>();
  ranked.forEach((list, listIndex) => {
    // Every named vector of one probe is one question asked twice; the probe
    // is what the reader is told about, so the lists collapse back to it.
    const probe = Math.floor(listIndex / VECTOR_NAMES.length);
    list.forEach((hit, rank) => {
      scores.set(hit.contentHash, (scores.get(hit.contentHash) ?? 0) + 1 / (RRF_K + rank + 1));
      const incumbent = best.get(hit.contentHash);
      if (incumbent === undefined || hit.score > incumbent.score) best.set(hit.contentHash, hit);
      (
        probes.get(hit.contentHash) ?? probes.set(hit.contentHash, new Set()).get(hit.contentHash)
      )?.add(probe);
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

/**
 * The texts a recall searches under: the goal first — so the fused list can
 * only add to what a bare search would have found — then the derived
 * conditions, stripped of blanks and repeats. An empty probe is not merely
 * useless: the provider rejects it and the whole batch comes back null.
 * Bounded by a slice, not by a greedy pack, so the count is exactly stated.
 */
export function probeTexts(goal: string, derived: readonly string[]): string[] {
  const seen = new Set<string>();
  return [queryText(goal), ...derived]
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && !seen.has(text) && seen.add(text))
    .slice(0, MAX_PROBES + 1);
}

/**
 * Every named vector asked of every probe, as one batch. The goal keeps the
 * full candidate budget and the derived conditions share it, so widening the
 * search does not multiply what comes back through a five-second timeout.
 */
export function probesOf(vectors: readonly (readonly number[])[], limit: number): MemoryProbe[] {
  const share = Math.max(1, Math.ceil(limit / Math.max(1, vectors.length)));
  return vectors.flatMap((vector, index) =>
    VECTOR_NAMES.map((using) => ({ vector, using, limit: index === 0 ? limit : share })),
  );
}

export interface ChunkOrigin {
  runId: string;
  pipeline: string;
  decision: ChunkSource['decision'];
  iteration: number;
  when: string;
}

/**
 * One `lesson` chunk per memory, addressed by the digest's own location id and
 * indexed by both halves the digest already separates: the condition it
 * applies under, and the instruction itself.
 */
export function chunksOf(
  memories: readonly MemoryToStore[],
  origin: ChunkOrigin,
  digestRunId: string | null,
  model: string,
): IndexedChunk[] {
  return memories.map((memory) => {
    const text = lessonText(memory);
    return {
      text,
      keys: { condition: memory.appliesWhen, lesson: memory.insight },
      contentHash: contentHash(text),
      source: { ...origin, kind: 'lesson', ref: `memory.${memory.position}` },
      evidence: memory.evidence,
      digestRunId,
      model,
    };
  });
}
