import { Inject, Injectable } from '@nestjs/common';
import type { SourceCall, SourceStatus } from '@sysdesign/contracts';

import { BUDGET_WINDOW_MS, bucketOf, type BudgetPolicy, type RequestGate } from '../../core/budget';
import type { OpportunitySearch, SourceCallLog } from '../../core/ports';
import { BUDGET_POLICY, OPPORTUNITY_SEARCH, REQUEST_GATE, SOURCE_CALL_LOG } from './tokens';

export interface CallsOptions {
  limit: number;
  offset: number;
}

const HOUR_MS = 60 * 60 * 1000;

/** The upstream as the client sees it: what it is, how much budget is left, and every call made to it. */
@Injectable()
export class SourceService {
  constructor(
    @Inject(OPPORTUNITY_SEARCH) private readonly search: OpportunitySearch,
    @Inject(SOURCE_CALL_LOG) private readonly log: SourceCallLog,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
  ) {}

  async status(): Promise<SourceStatus> {
    return {
      id: this.search.id,
      availability: this.search.availability,
      budget: {
        spent: await this.gate.spent(this.search.id),
        limit: this.dailyBudget(),
        windowHours: BUDGET_WINDOW_MS / HOUR_MS,
      },
      cacheTtlHours: this.budget.ttlMs / HOUR_MS,
    };
  }

  /** The ledger, newest first. */
  async calls(options: CallsOptions): Promise<[SourceCall[], number]> {
    const [rows, total] = await this.log.list(options.limit, options.offset);
    return [
      rows.map(({ requestedAt, ...row }) => ({ ...row, requestedAt: requestedAt.toISOString() })),
      total,
    ];
  }

  dailyBudget(): number {
    return bucketOf(this.budget, this.search.id)?.dailyBudget ?? 0;
  }
}
