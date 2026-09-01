import type { NfrFact, PromptFacts } from './types';

/**
 * Reading the numbers the prompt actually states.
 *
 * `NfrTargetSpec` has existed since the generator learned to emit machine-
 * readable targets, and until now nothing scored against it: it reached
 * `PromptFacts`, got serialized into the LLM prompt, and stopped. A design held
 * to `p99 ≤ 50ms` and one held to `p99 ≤ 5000ms` graded identically, because
 * the only quantitative gate in the engine was a hard-coded cliff at 300ms on
 * the prompt-wide `scaleTargets`.
 *
 * That made the hardest thing about a design — the size of the number it has to
 * hit — invisible to the grade. These read it instead.
 */

/** Metrics the engine knows how to grade against. Others ride along unread. */
export const GRADED_METRICS = ['p99_latency_ms', 'availability_pct', 'rto_minutes'] as const;
export type GradedMetric = (typeof GRADED_METRICS)[number];

/**
 * The strictest budget the prompt states for a metric, or null when it states
 * none. Strictness follows the operator: `<=` wants the smallest number stated,
 * `>=` the largest — a prompt asking for both 99.9% and 99.99% is held to
 * 99.99%.
 */
export function strictestTarget(facts: PromptFacts, metric: GradedMetric): NfrFact | null {
  const stated = facts.nfrs.filter((nfr) => nfr.targetSpec?.metric === metric);
  if (stated.length === 0) return null;

  return stated.reduce((strictest, candidate) => {
    const a = candidate.targetSpec?.value ?? 0;
    const b = strictest.targetSpec?.value ?? 0;
    const wantsSmaller = candidate.targetSpec?.op !== '>=';
    return (wantsSmaller ? a < b : a > b) ? candidate : strictest;
  });
}

/**
 * The p99 the design is actually held to: the STRICTEST number the prompt
 * states, wherever it states it.
 *
 * A prompt carries a headline figure on `scaleTargets` and may also pin a
 * specific requirement with its own `targetSpec`. Taking the tighter of the two
 * is both the reading a reviewer would apply and the one that cannot be gamed —
 * a loose headline beside a tight requirement is still a tight design.
 */
export function latencyBudgetMs(facts: PromptFacts): number {
  const stated = strictestTarget(facts, 'p99_latency_ms')?.targetSpec?.value;
  return stated === undefined
    ? facts.scaleTargets.p99LatencyMs
    : Math.min(stated, facts.scaleTargets.p99LatencyMs);
}

/**
 * What one synchronous hop costs of that budget: serialization, queueing, the
 * network, and the callee's own overhead before any work happens.
 *
 * 50ms is not a guess: it is the figure that reproduces the judgement the
 * hard-coded rule already encoded — five hops against the reference prompt's
 * 250ms budget. Wiring the target re-expresses that judgement rather than
 * quietly retuning it. What changes is that the budget is now READ: a 50ms
 * target affords one hop, a 5000ms target puts this rule out of reach.
 */
export const PER_HOP_LATENCY_MS = 50;

/** How deep a synchronous chain the stated budget pays for. */
export function affordableSyncHops(facts: PromptFacts): number {
  return Math.max(1, Math.floor(latencyBudgetMs(facts) / PER_HOP_LATENCY_MS));
}

/**
 * A cold start costs roughly this much before a line of handler runs. A budget
 * at or under it cannot absorb one on the synchronous path.
 */
export const COLD_START_MS = 300;

/** The availability the design is held to, as a percentage. */
export function availabilityTargetPct(facts: PromptFacts): number {
  const stated = strictestTarget(facts, 'availability_pct')?.targetSpec?.value;
  return stated ?? Number(facts.scaleTargets.availabilityPct);
}

/**
 * How many nines the target asks for. The step from 99.9 to 99.99 is where a
 * single region stops being enough, so rules that demand redundancy scale with
 * it rather than firing identically at every availability requirement.
 */
export function availabilityNines(facts: PromptFacts): number {
  const pct = availabilityTargetPct(facts);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return 0;
  return Math.round(-Math.log10(1 - pct / 100) * 10) / 10;
}
