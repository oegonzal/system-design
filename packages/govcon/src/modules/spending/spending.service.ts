import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  currentFiscalPeriod,
  isoDateOf,
  type AgencyDirectory,
  type AgencyOutlook,
  type HorizonRow,
  type Provenance,
  type SpendingBreakdown,
  type SpendingHorizon,
  type SpendingPulse,
  type SpendingScope,
} from '@sysdesign/contracts';

import type { BudgetPolicy, RequestGate } from '../../core/budget';
import type {
  OpportunityRepository,
  SpendingSnapshotStore,
  SpendingSources,
} from '../../core/ports';
import { SnapshotCache, type LensAnswer, type ReadOptions } from '../../core/spending/lens';
import { agencyLens } from '../../core/spending/lenses/agency';
import { breakdownLens } from '../../core/spending/lenses/breakdown';
import type { LensDeps } from '../../core/spending/lenses/deps';
import { directoryLens } from '../../core/spending/lenses/directory';
import { horizonLens } from '../../core/spending/lenses/horizon';
import { pulseLens } from '../../core/spending/lenses/pulse';
import { horizonNaics, matchOpenNotices, openNoticesFilter } from '../../core/spending/recompetes';
import { OPPORTUNITY_REPOSITORY } from '../opportunities/tokens';
import { BUDGET_POLICY, CLOCK, REQUEST_GATE, SPENDING_SOURCES } from '../sources/tokens';
import type {
  AgencyOutlookQueryInput,
  BreakdownQueryInput,
  HorizonQueryInput,
  PulseQueryInput,
} from './spending-requests';
import { SPENDING_SNAPSHOTS } from './tokens';

/** The scope out of a validated query: absent agency means every agency. */
const scopeOf = (
  query: Pick<PulseQueryInput, 'naics' | 'psc' | 'agency' | 'awardFamily'>,
): SpendingScope => ({
  naics: query.naics,
  psc: query.psc,
  agency: query.agency ?? null,
  awardFamily: query.awardFamily,
});

/**
 * The spending lenses as a service: every read goes through the one snapshot
 * cache over the one gate, the clock-derived inputs (the fiscal period,
 * today) join the query so a snapshot is never served for another day, a
 * read may be asked to refresh, the horizon's rows are joined to the open
 * stored notices on every read and never stored, and a lens's refusal
 * becomes the HTTP answer every other module gives — 404 for something the
 * source does not have, 503 for a spent budget or a rate limit, 502 for a
 * source that failed.
 */
@Injectable()
export class SpendingService {
  private readonly logger = new Logger(SpendingService.name);
  private readonly cache: SnapshotCache;
  private readonly deps: LensDeps;

  constructor(
    @Inject(SPENDING_SNAPSHOTS) store: SpendingSnapshotStore,
    @Inject(SPENDING_SOURCES) sources: SpendingSources,
    @Inject(BUDGET_POLICY) policy: BudgetPolicy,
    @Inject(REQUEST_GATE) gate: RequestGate,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly notices: OpportunityRepository,
  ) {
    this.cache = new SnapshotCache(store, policy.ttlMs, now, (message) =>
      this.logger.warn(message),
    );
    this.deps = {
      sources,
      gate,
      now,
      deadlineMs: policy.pullDeadlineMs,
      read: (spec, query) => this.cache.read(spec, query),
    };
  }

  pulse(query: PulseQueryInput, options: ReadOptions = {}): Promise<SpendingPulse> {
    const current = currentFiscalPeriod(this.now().getTime());
    return this.answer(
      this.cache.read(
        pulseLens(this.deps),
        {
          ...scopeOf(query),
          lookback: query.lookback,
          fiscalYear: current.fiscalYear,
          period: current.period,
        },
        options,
      ),
    );
  }

  breakdown(query: BreakdownQueryInput, options: ReadOptions = {}): Promise<SpendingBreakdown> {
    return this.answer(
      this.cache.read(
        breakdownLens(this.deps),
        { ...scopeOf(query), category: query.category, from: query.from, to: query.to },
        options,
      ),
    );
  }

  async horizon(query: HorizonQueryInput, options: ReadOptions = {}): Promise<SpendingHorizon> {
    const body = await this.answer(
      this.cache.read(
        horizonLens(this.deps),
        { ...scopeOf(query), months: query.months, today: isoDateOf(this.now().getTime()) },
        options,
      ),
    );
    return { ...body, ...(await this.openNoticesOf(body.rows)) };
  }

  agencies(options: ReadOptions = {}): Promise<AgencyDirectory> {
    return this.answer(this.cache.read(directoryLens(this.deps), {}, options));
  }

  async agency(
    toptierCode: string,
    query: AgencyOutlookQueryInput,
    options: ReadOptions = {},
  ): Promise<AgencyOutlook> {
    const current = currentFiscalPeriod(this.now().getTime());
    // No year asked: the lens takes the agency's active year from the directory.
    const fiscalYear = query.fiscalYear ?? null;
    if (fiscalYear !== null && fiscalYear > current.fiscalYear) {
      throw new BadRequestException(`fiscal year ${fiscalYear} has not begun`);
    }
    return this.answer(
      this.cache.read(
        agencyLens(this.deps),
        { toptierCode, fiscalYear, awardFamily: query.awardFamily },
        options,
      ),
    );
  }

  /** The open stored notices the rows share a NAICS and a buyer with — joined on every read, never stored. */
  private async openNoticesOf(
    rows: readonly HorizonRow[],
  ): Promise<Pick<SpendingHorizon, 'openNotices' | 'openNoticesCapped'>> {
    const naics = horizonNaics(rows);
    if (naics.length === 0) return { openNotices: [], openNoticesCapped: false };
    const { opportunities, capped } = await this.notices.findCandidates(
      openNoticesFilter(naics, this.now()),
    );
    return { openNotices: matchOpenNotices(rows, opportunities), openNoticesCapped: capped };
  }

  /** The body with its provenance, or the HTTP answer a refusal is. */
  private async answer<B extends object>(
    pending: Promise<LensAnswer<B>>,
  ): Promise<B & { provenance: Provenance }> {
    const answer = await pending;
    switch (answer.kind) {
      case 'ok':
        return { ...answer.body, provenance: answer.provenance };
      case 'missing':
        throw new NotFoundException(`no ${answer.what} ${answer.id}`);
      case 'budget-exhausted':
        throw new ServiceUnavailableException(`budget ${answer.spent}/${answer.budget} spent`);
      case 'error':
        if (answer.outcome === 'rate-limited') {
          throw new ServiceUnavailableException(`rate-limited: ${answer.message}`);
        }
        throw new BadGatewayException(`${answer.outcome}: ${answer.message}`);
    }
  }
}
