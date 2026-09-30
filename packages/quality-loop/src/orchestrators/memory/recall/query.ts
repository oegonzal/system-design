/**
 * What a recall searches with: the goal's head as the query, the conditions
 * it searches under, the probes those become against every named vector,
 * and the memory query the curator is handed once the hits are in.
 */
import { capText } from '@sysdesign/run-dump';

import {
  MAX_CANDIDATES,
  MAX_KEPT,
  memoryQuerySchema,
  probeAlias,
  RECALL_RULES,
  type MemoryQuery,
} from '../../../pipelines/memory-recall/input';
import { MAX_PROBES, VECTOR_NAMES, type MemoryHit, type MemoryProbe } from '../ports';

/** The recall query is the goal's head: enough to embed and to judge candidates against. */
const QUERY_MAX_BYTES = 16_000;

export const queryText = (goal: string): string => capText(goal, QUERY_MAX_BYTES).text;

/** A hit after fusion, with the probes that surfaced it. */
export interface FusedHit extends MemoryHit {
  /** Indices into the probe texts; 0 is the prompt itself. */
  probes: number[];
}

/**
 * The texts a recall searches under: the goal first — so the fused list can
 * only add to what a bare search would have found — then the derived
 * conditions, stripped of blanks and repeats. An empty probe is not merely
 * useless: the provider rejects it and the whole batch comes back null.
 * Bounded by a slice, not by a greedy pack, so the count is exactly stated.
 */
export function probeTexts(goal: string, derived: readonly string[]): string[] {
  const trimmed = [queryText(goal), ...derived].map((text) => text.trim());
  return [...new Set(trimmed.filter((text) => text.length > 0))].slice(0, MAX_PROBES + 1);
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

/**
 * Which probe text a ranked list answers for. Every named vector of one probe
 * is one question asked twice; the probe is what a reader is told about, so
 * the lists collapse back to it.
 */
export const probeOf = (listIndex: number): number => Math.floor(listIndex / VECTOR_NAMES.length);

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
    rules: [...RECALL_RULES],
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
