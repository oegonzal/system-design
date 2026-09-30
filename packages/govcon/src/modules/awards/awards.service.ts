import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AWARD_PAGE_SIZE,
  MAX_AWARD_LIMIT,
  MAX_AWARD_PAGES,
  type Award,
  type AwardsFetchSlice,
  type AwardsQuery,
  type AwardsSummary,
  type AwardSource,
  type FetchAwardsReport,
  type FetchAwardsRequest,
} from '@sysdesign/contracts';

import { bucketOf, type BudgetPolicy, type Gated, type RequestGate } from '../../core/budget';
import { summarizeAwards } from '../../core/intel';
import type {
  AwardFilter,
  AwardPage,
  AwardRepository,
  ContractAwards,
  SpendingAwards,
} from '../../core/ports';
import {
  BUDGET_POLICY,
  CLOCK,
  CONTRACT_AWARDS,
  REQUEST_GATE,
  SPENDING_AWARDS,
} from '../sources/tokens';
import { AWARD_REPOSITORY } from './tokens';

/** `AwardsQuery` with the paging taken off. */
export type AwardFilters = Omit<AwardsQuery, 'limit' | 'offset'>;

export const filterOf = (query: AwardFilters): AwardFilter => ({
  naicsPrefix: query.naics ?? null,
  pscPrefix: query.psc ?? null,
  agencyContains: query.agency ?? null,
  solicitationNumber: query.solicitationNumber ?? null,
  awardeeUei: query.awardeeUei ?? null,
  signedFrom: query.from ?? null,
  signedTo: query.to ?? null,
  source: query.source ?? null,
});

const sliceOf = (source: AwardSource, code: string): AwardsFetchSlice => ({
  source,
  code,
  outcome: 'ok',
  pages: 0,
  received: 0,
  inserted: 0,
  updated: 0,
  truncated: false,
  detail: null,
});

/**
 * Awards as intel. A fetch spends by source and code — SAM.gov's Contract
 * Awards one gated page per code (the shared bucket), USAspending one gated
 * page per fetch (free) — up to `MAX_AWARD_PAGES` each, storing what
 * normalized; a listing and a summary read the store and spend nothing.
 */
@Injectable()
export class AwardsService {
  private readonly logger = new Logger(AwardsService.name);

  constructor(
    @Inject(AWARD_REPOSITORY) private readonly awards: AwardRepository,
    @Inject(CONTRACT_AWARDS) private readonly contractAwards: ContractAwards,
    @Inject(SPENDING_AWARDS) private readonly spendingAwards: SpendingAwards,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async list(query: AwardFilters, limit: number, offset: number): Promise<[Award[], number]> {
    return this.awards.list(filterOf(query), limit, offset);
  }

  async summary(query: AwardFilters): Promise<AwardsSummary> {
    return summarizeAwards(await this.awards.findMatching(filterOf(query), MAX_AWARD_LIMIT));
  }

  async fetch(request: FetchAwardsRequest): Promise<FetchAwardsReport> {
    const slices: AwardsFetchSlice[] = [];
    let stopped = false;
    if (request.sources.includes('sam.gov')) {
      for (const [kind, codes] of [
        ['naics', request.naics],
        ['psc', request.psc ?? []],
      ] as const) {
        for (const code of codes) {
          const slice = sliceOf('sam.gov', code);
          if (stopped) {
            slice.outcome = 'skipped';
            slice.detail = 'stopped earlier';
          } else {
            stopped = await this.paged(slice, (page) =>
              this.gate.spend(
                {
                  source: this.contractAwards.id,
                  operation: 'awards',
                  query: {
                    naics: kind === 'naics' ? code : null,
                    psc: kind === 'psc' ? code : null,
                    from: request.from,
                    to: request.to,
                    limit: AWARD_PAGE_SIZE,
                    offset: page * AWARD_PAGE_SIZE,
                  },
                  cacheable: false,
                },
                () =>
                  this.contractAwards.search({
                    naics: kind === 'naics' ? code : null,
                    psc: kind === 'psc' ? code : null,
                    from: request.from,
                    to: request.to,
                    limit: AWARD_PAGE_SIZE,
                    offset: page * AWARD_PAGE_SIZE,
                  }),
              ),
            );
          }
          slices.push(slice);
        }
      }
    }
    if (request.sources.includes('usaspending')) {
      const slice = sliceOf('usaspending', [...request.naics, ...(request.psc ?? [])].join(','));
      await this.paged(slice, (page) =>
        this.gate.spend(
          {
            source: this.spendingAwards.id,
            operation: 'spending',
            query: {
              naics: request.naics,
              psc: request.psc ?? [],
              from: request.from,
              to: request.to,
              page: page + 1,
              limit: AWARD_PAGE_SIZE,
            },
            cacheable: false,
          },
          () =>
            this.spendingAwards.search({
              naics: request.naics,
              psc: request.psc ?? [],
              from: request.from,
              to: request.to,
              page: page + 1,
              limit: AWARD_PAGE_SIZE,
            }),
        ),
      );
      slices.push(slice);
    }
    return {
      slices,
      spent: await this.gate.spent(this.contractAwards.id),
      budget: bucketOf(this.budget, this.contractAwards.id)?.dailyBudget ?? 0,
    };
  }

  /** Pages one slice up to the bound; true when the budget or a rate limit means the rest must be skipped. */
  private async paged(
    slice: AwardsFetchSlice,
    fetchPage: (page: number) => Promise<Gated<AwardPage>>,
  ): Promise<boolean> {
    for (let page = 0; page < MAX_AWARD_PAGES; page += 1) {
      const result = await fetchPage(page);
      if (result.kind === 'ok') {
        const fetchedAt = this.now().toISOString();
        slice.pages += 1;
        slice.received += result.value.awards.length + result.value.rejected;
        const summary = await this.awards.upsertMany(
          result.value.awards.map((award) => ({ ...award, fetchedAt })),
        );
        slice.inserted += summary.inserted;
        slice.updated += summary.updated;
        if (!result.value.hasMore) return false;
        if (page + 1 < MAX_AWARD_PAGES) continue;
        slice.truncated = true;
        slice.detail = `more pages beyond ${MAX_AWARD_PAGES}`;
        return false;
      }
      if (result.kind === 'cached') return false;
      if (result.kind === 'budget-exhausted') {
        slice.outcome = slice.pages === 0 ? 'budget-exhausted' : slice.outcome;
        slice.truncated = slice.pages > 0;
        slice.detail = `budget ${result.spent}/${result.budget} spent`;
        return true;
      }
      slice.outcome = 'error';
      slice.truncated = slice.pages > 0;
      slice.detail = `${result.outcome}: ${result.message}`;
      this.logger.warn(`awards ${slice.source} ${slice.code} failed — ${slice.detail}`);
      return result.outcome === 'rate-limited';
    }
    return false;
  }
}
