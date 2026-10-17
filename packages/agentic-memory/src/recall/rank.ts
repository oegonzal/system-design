/**
 * How recalled memories are ordered and budgeted: a deterministic weighted
 * score over declared factors, no similarity floor (a universal threshold is
 * not set without measuring it against recall tests), and a budget filled in
 * rank order. The weights and the budget are the policy's.
 *
 *   score = w.similarity · similarity            cosine, floored at 0
 *         + w.exact      · (found by a key ? 1 : 0)
 *         + w.recency    · 0.5 ^ (age in days / half-life)
 *         + w.support    · (1 − 1 / support)    independent confirmations
 */
import type { RecallFactorsDto, RecallRoute } from '@sysdesign/contracts';

import { byText } from '../order';
import type { MemoryRecord } from '../ports';
import type { MemoryPolicy } from '../space/policy';

const DAY_MS = 86_400_000;

export interface Candidate {
  record: MemoryRecord;
  similarity: number;
  routes: ReadonlySet<RecallRoute>;
}

export interface Ranked extends Candidate {
  factors: RecallFactorsDto;
  score: number;
}

export function factorsOf(candidate: Candidate, policy: MemoryPolicy, now: Date): RecallFactorsDto {
  const ageDays = Math.max(0, now.getTime() - candidate.record.validFrom.getTime()) / DAY_MS;
  return {
    similarity: Math.max(0, candidate.similarity),
    exact: candidate.routes.has('exact') ? 1 : 0,
    recency: 0.5 ** (ageDays / policy.recall.recencyHalfLifeDays),
    support: 1 - 1 / candidate.record.support,
  };
}

const scoreOf = (factors: RecallFactorsDto, weights: MemoryPolicy['recall']['weights']): number =>
  weights.similarity * factors.similarity +
  weights.exact * factors.exact +
  weights.recency * factors.recency +
  weights.support * factors.support;

/** Highest score first; ties by the newer valid time, then by id. */
export function rank(candidates: readonly Candidate[], policy: MemoryPolicy, now: Date): Ranked[] {
  return candidates
    .map((candidate) => {
      const factors = factorsOf(candidate, policy, now);
      return { ...candidate, factors, score: scoreOf(factors, policy.recall.weights) };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.record.validFrom.getTime() - a.record.validFrom.getTime() ||
        byText(a.record.id, b.record.id),
    );
}

/** Walk the ranking, keeping what fits: at most `maxItems`, and an item that would pass `maxChars` skipped, never blocking the rest. */
export function fill(
  ranked: readonly Ranked[],
  budget: MemoryPolicy['recall'],
): { items: Ranked[]; omitted: number } {
  const items: Ranked[] = [];
  let chars = 0;
  for (const candidate of ranked) {
    if (items.length === budget.maxItems) break;
    if (chars + candidate.record.text.length > budget.maxChars) continue;
    items.push(candidate);
    chars += candidate.record.text.length;
  }
  return { items, omitted: ranked.length - items.length };
}
