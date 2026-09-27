import type {
  FreshCall,
  OpportunitySource,
  SourceAvailability,
  SourceCallLog,
  SourceResult,
} from './ports';
import { queryKey, type OpportunityQuery } from './query';

/** The budget's window: strictly at least as strict as any calendar-day quota with the same count. */
export const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface BudgetPolicy {
  /** How long a successful call answers the same query again; 0 disables the cache. */
  ttlMs: number;
  /** Attempts allowed inside the rolling window, every outcome counted. */
  dailyBudget: number;
}

/**
 * A source that spends nothing it does not have to. Before each search: a
 * fresh `ok` call for the same key answers `cached` (the records are already
 * stored); a spent budget answers `budget-exhausted` without calling; otherwise
 * the inner source is called and the attempt recorded, whatever it returned.
 *
 * The log is an optimisation, never a dependency: a read that fails falls
 * through to the call with a warning, a write that fails loses one ledger row
 * with a warning. Time is injected — nothing here reads a clock.
 */
export class BudgetedSource implements OpportunitySource {
  readonly id: string;
  readonly availability: SourceAvailability;

  constructor(
    private readonly inner: OpportunitySource,
    private readonly log: SourceCallLog,
    private readonly policy: BudgetPolicy,
    private readonly now: () => Date,
    private readonly warn: (message: string) => void = () => undefined,
  ) {
    this.id = inner.id;
    this.availability = inner.availability;
  }

  async search(query: OpportunityQuery): Promise<SourceResult> {
    const key = queryKey(this.id, query);
    const at = this.now();

    if (this.policy.ttlMs > 0) {
      const fresh = await this.read(
        () => this.log.findFresh(this.id, key, new Date(at.getTime() - this.policy.ttlMs)),
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

    const spent = await this.read(
      () => this.log.countSince(this.id, new Date(at.getTime() - BUDGET_WINDOW_MS)),
      'call count',
    );
    if (spent !== null && spent >= this.policy.dailyBudget) {
      return { kind: 'budget-exhausted', spent, budget: this.policy.dailyBudget };
    }

    const started = this.now();
    const result = await this.inner.search(query);
    const durationMs = Math.max(0, this.now().getTime() - started.getTime());
    await this.record(key, query, started, durationMs, result);
    return result;
  }

  private async read<T>(fn: () => Promise<T>, what: string): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.warn(`call log ${what} not read: ${messageOf(error)}`);
      return null;
    }
  }

  private async record(
    key: string,
    query: OpportunityQuery,
    requestedAt: Date,
    durationMs: number,
    result: SourceResult,
  ): Promise<void> {
    // Only what the inner source did is a call; a stacked decorator's own
    // answers are not attempts and are not counted twice.
    if (result.kind !== 'ok' && result.kind !== 'error') return;
    const call =
      result.kind === 'ok'
        ? {
            status: 200,
            outcome: 'ok' as const,
            totalRecords: result.totalRecords,
            recordCount: result.opportunities.length + result.rejected.length,
            error: null,
          }
        : {
            status: result.status,
            outcome: result.outcome,
            totalRecords: null,
            recordCount: null,
            error: result.message,
          };
    try {
      await this.log.record({
        source: this.id,
        operation: 'search',
        queryKey: key,
        query,
        requestedAt,
        durationMs,
        ...call,
      });
    } catch (error) {
      this.warn(`call log not written: ${messageOf(error)}`);
    }
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export type { FreshCall };
