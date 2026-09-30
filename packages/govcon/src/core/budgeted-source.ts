import type {
  BudgetExhausted,
  DescribeResult,
  FreshCall,
  OpportunitySource,
  SourceAvailability,
  SourceCall,
  SourceCallLog,
  SourceFailure,
  SourceResult,
} from './ports';
import { descriptionKey, queryKey, type OpportunityQuery } from './query';

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
 * A description skips the cache question — the store is its cache — and is
 * otherwise budgeted and recorded the same way.
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

    const exhausted = await this.exhausted(at);
    if (exhausted) return exhausted;

    const started = this.now();
    const result = await this.inner.search(query);
    const durationMs = Math.max(0, this.now().getTime() - started.getTime());
    if (result.kind === 'ok' || result.kind === 'error') {
      await this.record({
        operation: 'search',
        attempt: 1,
        queryKey: key,
        query,
        requestedAt: started,
        durationMs,
        ...(result.kind === 'ok'
          ? {
              status: 200,
              outcome: 'ok',
              totalRecords: result.totalRecords,
              recordCount: result.opportunities.length + result.rejected.length,
              error: null,
            }
          : failure(result)),
      });
    }
    return result;
  }

  /**
   * A description spends the budget like a page but is never cached here: the
   * stored row is its cache, and the service asks the store before asking us.
   */
  async describe(noticeId: string): Promise<DescribeResult> {
    const exhausted = await this.exhausted(this.now());
    if (exhausted) return exhausted;

    const started = this.now();
    const result = await this.inner.describe(noticeId);
    const durationMs = Math.max(0, this.now().getTime() - started.getTime());
    if (result.kind === 'ok' || result.kind === 'error') {
      await this.record({
        operation: 'description',
        attempt: 1,
        queryKey: descriptionKey(this.id, noticeId),
        query: { noticeId },
        requestedAt: started,
        durationMs,
        ...(result.kind === 'ok'
          ? { status: 200, outcome: 'ok', totalRecords: null, recordCount: 1, error: null }
          : failure(result)),
      });
    }
    return result;
  }

  private async exhausted(at: Date): Promise<BudgetExhausted | null> {
    const spent = await this.read(
      () => this.log.countSince(this.id, new Date(at.getTime() - BUDGET_WINDOW_MS)),
      'call count',
    );
    if (spent !== null && spent >= this.policy.dailyBudget) {
      return { kind: 'budget-exhausted', spent, budget: this.policy.dailyBudget };
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

  private async record(call: Omit<SourceCall, 'source'>): Promise<void> {
    try {
      await this.log.record({ source: this.id, ...call });
    } catch (error) {
      this.warn(`call log not written: ${messageOf(error)}`);
    }
  }
}

/** The ledger columns of a failed attempt. */
const failure = (
  result: SourceFailure,
): Pick<SourceCall, 'status' | 'outcome' | 'totalRecords' | 'recordCount' | 'error'> => ({
  status: result.status,
  outcome: result.outcome,
  totalRecords: null,
  recordCount: null,
  error: result.message,
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export type { FreshCall };
