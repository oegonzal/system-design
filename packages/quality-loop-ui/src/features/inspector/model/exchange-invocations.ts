import type { LlmExchangeOutcome, LlmExchangeSummaryDto } from '@sysdesign/contracts';

/**
 * Model calls grouped into invocations — one call and every attempt of it.
 *
 * An exchange row is one *attempt*, and `ordinal` increments per attempt rather
 * than per call, so the rows alone cannot say "this was asked three times".
 * `attempt` can: it is 1-based within a call, so a new invocation begins at every
 * row whose attempt is 1. Rows written before the seam could retry carry no
 * attempt at all and read as a single attempt, which is exactly what they were.
 *
 * This is also why an exchange is never attributed to an iteration: with
 * ordinals counting attempts, any arithmetic from ordinal to iteration breaks on
 * the first retry. The scope is what a reader joins on instead.
 */

export interface Invocation {
  /** The stage that was asked — `producer`, `critic.scale.s2`. */
  scope: string;
  /** Every attempt of this one call, in the order they were made. */
  attempts: LlmExchangeSummaryDto[];
  /** What the last attempt produced: how the call ended. */
  outcome: LlmExchangeOutcome;
  /** Time across every attempt, which is what the call actually cost. */
  totalMs: number;
  startedAt: string;
  /** The names of the failures that cost an attempt, in order. */
  failures: string[];
  /** True when it took more than one attempt to get an answer. */
  retried: boolean;
}

const invocationOf = (attempts: LlmExchangeSummaryDto[]): Invocation => {
  const last = attempts[attempts.length - 1];
  return {
    scope: last.scope,
    attempts,
    outcome: last.outcome,
    totalMs: attempts.reduce((total, attempt) => total + attempt.durationMs, 0),
    startedAt: attempts[0].startedAt,
    failures: attempts
      .slice(0, -1)
      .map((attempt) => attempt.errorName ?? attempt.outcome)
      .filter((name): name is string => name !== null),
    retried: attempts.length > 1,
  };
};

/**
 * The exchanges as invocations. Rows are grouped by scope and split at every
 * first attempt, so two separate calls to one stage stay two invocations.
 */
export function invocationsOf(exchanges: readonly LlmExchangeSummaryDto[]): Invocation[] {
  const open = new Map<string, LlmExchangeSummaryDto[]>();
  const done: LlmExchangeSummaryDto[][] = [];
  for (const exchange of [...exchanges].sort((a, b) => a.ordinal - b.ordinal)) {
    const held = open.get(exchange.scope);
    // An absent attempt is a row from before retries existed: one attempt, so
    // it both closes whatever was open and stands alone.
    const starts = exchange.attempt === undefined || exchange.attempt <= 1;
    if (held !== undefined && starts) {
      done.push(held);
      open.delete(exchange.scope);
    }
    const current = open.get(exchange.scope) ?? [];
    current.push(exchange);
    open.set(exchange.scope, current);
  }
  for (const attempts of open.values()) done.push(attempts);
  return done.map(invocationOf).sort((a, b) => a.attempts[0].ordinal - b.attempts[0].ordinal);
}

export interface InvocationTotals {
  calls: number;
  attempts: number;
  retried: number;
  failed: number;
  totalMs: number;
}

/** What the model cost this run, counted by call rather than by attempt. */
export const invocationTotals = (invocations: readonly Invocation[]): InvocationTotals => ({
  calls: invocations.length,
  attempts: invocations.reduce((total, call) => total + call.attempts.length, 0),
  retried: invocations.filter((call) => call.retried).length,
  failed: invocations.filter((call) => call.outcome !== 'ok').length,
  totalMs: invocations.reduce((total, call) => total + call.totalMs, 0),
});
