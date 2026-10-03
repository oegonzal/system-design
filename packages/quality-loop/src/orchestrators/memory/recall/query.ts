/**
 * What a recall searches with: the goal's head as the query, the conditions
 * it searches under, the probes those become against every named vector,
 * and the memory query the curator is handed once the hits are in.
 */
import {
  modelSchema,
  parseLenient,
  type RecallOrigin,
  type SchemaIssue,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import {
  focusAlias,
  MAX_CANDIDATES,
  MAX_FOCUS,
  MAX_KEPT,
  MAX_PROBES,
  memoryQuerySchema,
  probeAlias,
  recallRules,
  type MemoryQuery,
} from '../../../pipelines/memory-recall/input';
import { VECTOR_NAMES, type MemoryHit, type MemoryProbe } from '../ports';

/** The recall query is the goal's head: enough to embed and to judge candidates against. */
const QUERY_MAX_BYTES = 16_000;

export const queryText = (goal: string): string => capText(goal, QUERY_MAX_BYTES).text;

/** A hit after fusion, with the probes that surfaced it. */
export interface FusedHit extends MemoryHit {
  /** Indices into the searched texts (`ProbeSet.texts`); 0 is the prompt itself. */
  probes: number[];
}

/**
 * A hit as the curator is offered it: fused and — when a screen placed it
 * against what the asker already holds — where it was learned. Absent on a
 * recall nothing screened, whose candidates say nothing of their origin.
 */
export interface OfferedHit extends FusedHit {
  origin?: RecallOrigin;
}

/**
 * The texts a recall searches under, each kept with the alias a candidate
 * cites it by: the goal first — so the fused list can only add to what a bare
 * search would have found — then the defects it was asked to focus on, then
 * the derived conditions, each group stripped of blanks and of anything
 * already searched. An empty probe is not merely useless: the provider
 * rejects it and the whole batch comes back null. Bounded by a slice, not by
 * a greedy pack, so the count is exactly stated.
 */
export interface ProbeSet {
  /** Everything searched, in order: the goal, the focus, the derived conditions. */
  texts: string[];
  /** The focus lines kept, in order: `d1`, `d2`… */
  focus: string[];
  /** The derived conditions kept, in order: `p1`, `p2`… */
  derived: string[];
}

export function probeSet(
  goal: string,
  derived: readonly string[],
  focus: readonly string[] = [],
): ProbeSet {
  const head = queryText(goal).trim();
  const seen = new Set([head]);
  const fresh = (texts: readonly string[], max: number): string[] => {
    const kept: string[] = [];
    for (const text of texts.map((candidate) => candidate.trim())) {
      if (kept.length === max) break;
      if (text.length === 0 || seen.has(text)) continue;
      seen.add(text);
      kept.push(text);
    }
    return kept;
  };
  const focused = fresh(focus, MAX_FOCUS);
  const conditions = fresh(derived, MAX_PROBES);
  return { texts: [head, ...focused, ...conditions], focus: focused, derived: conditions };
}

/** The texts alone, for a search with no focus. */
export const probeTexts = (goal: string, derived: readonly string[]): string[] =>
  probeSet(goal, derived).texts;

/** The alias a candidate cites the searched text at `index` by; none for the goal, which is not information. */
export function searchAlias(set: ProbeSet, index: number): string | null {
  if (index <= 0 || index >= set.texts.length) return null;
  const inFocus = index - 1;
  return inFocus < set.focus.length ? focusAlias(inFocus) : probeAlias(inFocus - set.focus.length);
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

/** The query, or every way the composed one missed the curator's schema — a diagnostic, never a throw. */
export type BuiltQuery =
  { query: MemoryQuery; issues: [] } | { query: null; issues: SchemaIssue[] };

const QUERY_BOUNDS = modelSchema(memoryQuerySchema).bounds;

/**
 * The query the curator judges: the whole prompt, what is wrong with the
 * answer it is about when the recall was focused, what that answer's producer
 * already holds when the recall was screened against it, the candidates, and
 * — for each — the defects and derived conditions it was retrieved under and,
 * once screened, its origin. The prompt itself is never cited, since "this
 * came back on the prompt" is not information. The novelty rule is stated
 * only beside something already in hand, so a recall with nothing known
 * composes the query it always did. Read as the seam reads a reply — a stored
 * lesson kept past its ceiling is offered whole — so a miss is a structural
 * fault or a query past the goal budget; either is reported, in the one
 * wording, rather than thrown.
 */
export function buildQuery(
  query: string,
  probes: ProbeSet,
  hits: readonly OfferedHit[],
  known: readonly string[] = [],
): BuiltQuery {
  const parsed = parseLenient(
    memoryQuerySchema,
    {
      query,
      rules: recallRules(known),
      focus: probes.focus,
      known,
      probes: probes.derived,
      maxKept: MAX_KEPT,
      candidates: hits.slice(0, MAX_CANDIDATES).map((hit) => ({
        text: hit.text,
        source: hit.source,
        matched: hit.probes.flatMap((index) => searchAlias(probes, index) ?? []),
        ...(hit.origin === undefined ? {} : { origin: hit.origin }),
      })),
    },
    QUERY_BOUNDS,
  );
  return parsed.ok ? { query: parsed.value, issues: [] } : { query: null, issues: parsed.issues };
}
