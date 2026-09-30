import { Inject, Injectable } from '@nestjs/common';
import type {
  BudgetBucket,
  SourceCall,
  SourceInfo,
  SourceOperation,
  SourceStatus,
} from '@sysdesign/contracts';

import { BUDGET_WINDOW_MS, type BudgetPolicy, type RequestGate } from '../../core/budget';
import type { OpportunitySearch, SourceCallLog, SpendingAwards } from '../../core/ports';
import {
  BUDGET_POLICY,
  OPPORTUNITY_SEARCH,
  REQUEST_GATE,
  SOURCE_CALL_LOG,
  SPENDING_AWARDS,
} from './tokens';

export interface CallsOptions {
  operation: SourceOperation | null;
  limit: number;
  offset: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The upstreams as the client sees them: each source, whether it can be
 * called and which bucket it spends; each bucket as the ledger counts it;
 * and every call made, newest first.
 */
@Injectable()
export class SourceService {
  constructor(
    @Inject(OPPORTUNITY_SEARCH) private readonly search: OpportunitySearch,
    @Inject(SPENDING_AWARDS) private readonly spending: SpendingAwards,
    @Inject(SOURCE_CALL_LOG) private readonly log: SourceCallLog,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
  ) {}

  async status(): Promise<SourceStatus> {
    const sources: SourceInfo[] = [this.search, this.spending].map((source) => ({
      id: source.id,
      availability: source.availability,
      bucket: source.id in this.budget.buckets ? source.id : null,
    }));
    const buckets: BudgetBucket[] = await Promise.all(
      Object.entries(this.budget.buckets).map(async ([id, bucket]) => ({
        id,
        spent: await this.gate.spent(id),
        limit: bucket.dailyBudget,
        windowHours: BUDGET_WINDOW_MS / HOUR_MS,
      })),
    );
    return { sources, buckets, cacheTtlHours: this.budget.ttlMs / HOUR_MS };
  }

  /** The ledger, newest first, one operation when asked. */
  async calls(options: CallsOptions): Promise<[SourceCall[], number]> {
    const [rows, total] = await this.log.list(options.limit, options.offset, options.operation);
    return [
      rows.map(({ requestedAt, ...row }) => ({ ...row, requestedAt: requestedAt.toISOString() })),
      total,
    ];
  }
}
