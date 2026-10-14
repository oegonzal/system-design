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
  facetsOfQuery,
  familyUnder,
  INCUMBENT_HORIZON_MONTHS,
  isoDateOf,
  type AgencyDirectory,
  type AgencyOutlook,
  type AwardDetail,
  type IncumbentGap,
  type NoticeIncumbents,
  type Provenance,
  type SpendingBreakdown,
  type SpendingHorizon,
  type SpendingPrimes,
  type SpendingPulse,
  type SpendingReach,
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
import { awardLens } from '../../core/spending/lenses/award';
import { breakdownLens } from '../../core/spending/lenses/breakdown';
import type { LensDeps } from '../../core/spending/lenses/deps';
import { directoryLens } from '../../core/spending/lenses/directory';
import { horizonLens } from '../../core/spending/lenses/horizon';
import { primesLens } from '../../core/spending/lenses/primes';
import { pulseLens } from '../../core/spending/lenses/pulse';
import { reachLens } from '../../core/spending/lenses/reach';
import {
  horizonNaics,
  incumbentPlanOf,
  incumbentsOf,
  matchOpenNotices,
  openNoticesFilter,
  type JoinedAward,
} from '../../core/spending/recompetes';
import { OPPORTUNITY_REPOSITORY } from '../opportunities/tokens';
import { BUDGET_POLICY, CLOCK, REQUEST_GATE, SPENDING_SOURCES } from '../sources/tokens';
import {
  horizonQuerySchema,
  isScopePsc,
  type AgencyOutlookQueryInput,
  type BreakdownQueryInput,
  type HorizonQueryInput,
  type IncumbentsQueryInput,
  type PrimesQueryInput,
  type PulseQueryInput,
  type ReachQueryInput,
  type ScopeInput,
} from './spending-requests';
import { SPENDING_SNAPSHOTS } from './tokens';

/**
 * The scope out of a validated query: an absent agency means every agency,
 * every facet not named is unset, and the family is the one the facets
 * leave — so one scope has one spelling, and one snapshot.
 */
const scopeOf = (query: ScopeInput): SpendingScope => {
  const facets = facetsOfQuery(query);
  return {
    naics: query.naics,
    psc: query.psc,
    agency: query.agency ?? null,
    awardFamily: familyUnder(query.awardFamily, facets),
    facets,
  };
};

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

  reach(query: ReachQueryInput, options: ReadOptions = {}): Promise<SpendingReach> {
    const { naics, psc, agency, facets } = scopeOf({ ...query, awardFamily: 'contracts' });
    return this.answer(
      this.cache.read(
        reachLens(this.deps),
        { naics, psc, agency, facets, from: query.from, to: query.to, lanes: query.lanes },
        options,
      ),
    );
  }

  primes(query: PrimesQueryInput, options: ReadOptions = {}): Promise<SpendingPrimes> {
    return this.answer(
      this.cache.read(
        primesLens(this.deps),
        { ...scopeOf(query), from: query.from, to: query.to, band: query.band ?? null },
        options,
      ),
    );
  }

  /** One award's record, with the open stored notices sharing its NAICS and buyer joined on every read. */
  async award(externalId: string, options: ReadOptions = {}): Promise<AwardDetail> {
    const body = await this.answer(this.cache.read(awardLens(this.deps), { externalId }, options));
    const { openNotices } = await this.openNoticesOf([body]);
    return { ...body, openNotices: openNotices[0]?.notices ?? [] };
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

  /**
   * Who may hold the work a stored notice is about: the awards in its NAICS
   * code — and its product service code, unless asked not to — ending in
   * the coming months, read through the horizon lens and kept to the
   * notice's own sub-agency by the join the horizon uses. The buyer's
   * department narrows the read only when the source lists it under that
   * code; the join holds either way. A notice lacking a fact the join needs
   * answers with that gap and asks no source anything.
   */
  async incumbents(
    noticeId: string,
    query: IncumbentsQueryInput,
    options: ReadOptions = {},
  ): Promise<NoticeIncumbents> {
    const notice = await this.notices.findOne(noticeId);
    if (notice === null) throw new NotFoundException(`no stored notice ${noticeId}`);
    const today = isoDateOf(this.now().getTime());
    const unread = (gap: IncumbentGap): NoticeIncumbents => ({
      noticeId,
      gap,
      scope: null,
      today,
      months: INCUMBENT_HORIZON_MONTHS,
      rows: [],
      listed: 0,
      capped: false,
      completeBefore: null,
      provenance: null,
    });
    const plan = incumbentPlanOf(notice, query.samePsc);
    if (plan.kind === 'gap') return unread(plan.gap);
    const directory = await this.agencies();
    const listed = directory.entries.some((entry) => entry.toptierCode === plan.toptier);
    const scoped = horizonQuerySchema.safeParse({
      naics: [plan.naics],
      psc: plan.psc !== null && isScopePsc(plan.psc) ? [plan.psc] : [],
      agency: listed ? plan.toptier : undefined,
      months: INCUMBENT_HORIZON_MONTHS,
    });
    // A code the scope refuses is a code the source does not take.
    if (!scoped.success) return unread('naics');
    const horizon = await this.answer(
      this.cache.read(
        horizonLens(this.deps),
        { ...scopeOf(scoped.data), months: scoped.data.months, today },
        options,
      ),
    );
    return {
      noticeId,
      gap: null,
      scope: horizon.scope,
      today: horizon.today,
      months: horizon.months,
      rows: incumbentsOf(notice, horizon.rows),
      listed: horizon.rows.length,
      capped: horizon.capped,
      completeBefore: horizon.completeBefore,
      provenance: horizon.provenance,
    };
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
    rows: readonly JoinedAward[],
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
