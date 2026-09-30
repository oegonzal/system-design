import type { SourceCallQueries, SourceOperation } from '@sysdesign/contracts';

import type { LedgerEntry, SourceCallLog } from '../ports/ledger';
import { callKey } from '../query';
import { messageOf } from '../text';
import type { Attempted } from './attempt';
import { BUDGET_WINDOW_MS, bucketOf, type BudgetPolicy } from './policy';

/** The rolling-day budget is spent; nothing was called. */
export interface BudgetExhausted {
  kind: 'budget-exhausted';
  spent: number;
  budget: number;
}

/** The upstream answered with something other than what was asked for. */
export interface SourceFailure {
  kind: 'error';
  outcome: 'error' | 'rate-limited' | 'invalid-response';
  status: number | null;
  /** Provider detail, bounded, never the request URL. */
  message: string;
}

/** What an adapter's last attempt produced: the value, sized for the ledger, or a failure. */
export type Fetched<T> =
  { kind: 'ok'; value: T; recordCount: number | null; totalRecords: number | null } | SourceFailure;

/**
 * What a gated call came back as. An adapter only ever answers `ok` or
 * `error`; the gate adds `cached` (the same query was answered inside the
 * cache window, so its records are already stored — nothing to fetch) and
 * `budget-exhausted` (the bucket is spent — nothing was called). One union,
 * so a consumer handles every case once.
 */
export type Gated<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'cached'; requestedAt: string; recordCount: number | null }
  | BudgetExhausted
  | SourceFailure;

export interface SpendSpec<K extends SourceOperation> {
  /** The upstream's id — the bucket and the ledger's `source`. */
  source: string;
  operation: K;
  query: SourceCallQueries[K];
  /** A fresh `ok` row for the same key answers `cached`: searches. A description's cache is its row. */
  cacheable: boolean;
}

/**
 * The one door every upstream request goes through. Before a call: a fresh
 * `ok` row for the same key answers `cached` when the call is cacheable; a
 * spent bucket answers `budget-exhausted` without calling. Then the adapter
 * runs and every attempt it made becomes one ledger row — attempt 1, 2 —
 * under the same key, so a retried 5xx counts twice, as the provider counts.
 *
 * The ledger is an optimisation, never a dependency: a read that fails falls
 * through to the call with a warning, a write that fails loses one row with
 * a warning. Time is injected — nothing here reads a clock.
 */
export class RequestGate {
  constructor(
    private readonly log: SourceCallLog,
    private readonly policy: BudgetPolicy,
    private readonly now: () => Date,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async spend<K extends SourceOperation, T>(
    spec: SpendSpec<K>,
    run: () => Promise<Attempted<Fetched<T>>>,
  ): Promise<Gated<T>> {
    const key = callKey(spec.source, spec.operation, spec.query);
    const at = this.now();

    if (spec.cacheable && this.policy.ttlMs > 0) {
      const fresh = await this.read(
        () =>
          this.log.findFresh(
            spec.source,
            spec.operation,
            key,
            new Date(at.getTime() - this.policy.ttlMs),
          ),
        'fresh call',
      );
      if (fresh) {
        return {
          kind: 'cached',
          requestedAt: fresh.requestedAt.toISOString(),
          recordCount: fresh.recordCount,
        };
      }
    }

    const exhausted = await this.exhausted(spec.source, at);
    if (exhausted) return exhausted;

    const { attempts, result } = await run();
    const last = attempts.length - 1;
    for (const [index, attempt] of attempts.entries()) {
      const sized = index === last && result.kind === 'ok';
      await this.record({
        source: spec.source,
        operation: spec.operation,
        query: spec.query,
        attempt: index + 1,
        queryKey: key,
        requestedAt: attempt.startedAt,
        durationMs: attempt.durationMs,
        status: attempt.status,
        outcome: attempt.outcome,
        totalRecords: sized ? result.totalRecords : null,
        recordCount: sized ? result.recordCount : null,
        error: attempt.error,
      });
    }
    return result.kind === 'ok' ? { kind: 'ok', value: result.value } : result;
  }

  /** Attempts inside the window for a source, as the ledger counts them; null when it could not be read. */
  spent(source: string, at: Date = this.now()): Promise<number | null> {
    return this.read(
      () => this.log.countSince(source, new Date(at.getTime() - BUDGET_WINDOW_MS)),
      'call count',
    );
  }

  private async exhausted(source: string, at: Date): Promise<BudgetExhausted | null> {
    const bucket = bucketOf(this.policy, source);
    if (bucket === null) return null;
    const spent = await this.spent(source, at);
    if (spent !== null && spent >= bucket.dailyBudget) {
      return { kind: 'budget-exhausted', spent, budget: bucket.dailyBudget };
    }
    return null;
  }

  private async read<T>(fn: () => Promise<T>, what: string): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.warn(`call log ${what} not read: ${messageOf(error)}`);
      return null;
    }
  }

  private async record<K extends SourceOperation>(entry: LedgerEntry<K>): Promise<void> {
    try {
      await this.log.record(entry);
    } catch (error) {
      this.warn(`call log not written: ${messageOf(error)}`);
    }
  }
}
