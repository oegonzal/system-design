/**
 * The pure half of a memory run: what goes into the recall query, what comes
 * out of a recall or a digest, and how memory reaches a target's goal. Every
 * read-out is over engine facts (artifacts, ledgers, the codecs' indexes),
 * never over prose.
 */
import { createHash } from 'node:crypto';

import type { RunTrace } from '@sysdesign/contracts';
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
  type ChunkSource,
  type MemoryQuery,
} from '../../pipelines/memory-recall/input';
import { memoryPackSchema, type MemoryPack } from '../../pipelines/memory-recall/output';
import type { EvidenceRef, MemoryChunk, MemoryHit } from './ports';

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

export function buildQuery(query: string, hits: readonly MemoryHit[]): MemoryQuery {
  return memoryQuerySchema.parse({
    query,
    rules: [...DEFAULT_RULES],
    maxKept: MAX_KEPT,
    candidates: hits
      .slice(0, MAX_CANDIDATES)
      .map((hit) => ({ text: hit.text, source: hit.source })),
  });
}

export interface UsableMemory {
  alias: string;
  kept: MemoryPack['kept'][number];
  hit: MemoryHit;
  /** How many passing criteria cited the chunk as evidence. */
  support: number;
}

const bestIteration = (trace: RunTrace) =>
  trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ?? null;

export interface RecallReadout {
  /** How many chunks the pack kept, faulted or not. */
  kept: number;
  usable: UsableMemory[];
}

/**
 * What an accepted recall endorses: kept chunks no confirmed finding names,
 * strongest support first. Anything short of `accept` endorses nothing.
 */
export function readPack(trace: RunTrace, hits: readonly MemoryHit[]): RecallReadout {
  const best = bestIteration(trace);
  const pack = best === null ? null : memoryPackSchema.safeParse(best.artifact);
  if (best === null || !pack?.success) return { kept: 0, usable: [] };
  const kept = pack.data.kept.length;
  if (trace.finalDecision !== 'accept') return { kept, usable: [] };
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
  return { kept, usable };
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

/** What an accepted digest endorses: memories no confirmed finding names, with their evidence resolved. */
export function memoriesToStore(trace: RunTrace): MemoryToStore[] {
  if (trace.finalDecision !== 'accept') return [];
  const best = bestIteration(trace);
  if (best === null) return [];
  const digest = experienceDigestSchema.safeParse(best.artifact);
  const index = readDigestIndex(trace.contract.goal);
  if (!digest.success || index === null) return [];
  const faulted = new Set(best.ledger.findings.flatMap((finding) => finding.locationRefs));
  const refOf = new Map(index.evidence.map((item) => [item.alias, item]));
  return digest.data.memories.flatMap((memory, position) => {
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
}

export const lessonText = (memory: MemoryToStore): string =>
  `${memory.insight} — applies when ${memory.appliesWhen}`;

export interface ChunkOrigin {
  runId: string;
  pipeline: string;
  decision: ChunkSource['decision'];
  iteration: number;
  when: string;
}

/** One `lesson` chunk per memory, addressed by the digest's own location id. */
export function chunksOf(
  memories: readonly MemoryToStore[],
  origin: ChunkOrigin,
  digestRunId: string | null,
  model: string,
): MemoryChunk[] {
  return memories.map((memory) => {
    const text = lessonText(memory);
    return {
      text,
      contentHash: contentHash(text),
      source: { ...origin, kind: 'lesson', ref: `memory.${memory.position}` },
      evidence: memory.evidence,
      digestRunId,
      model,
    };
  });
}
