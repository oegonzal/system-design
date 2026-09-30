import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Description,
  DescriptionFetch,
  LeadsReport,
  LeadTier,
  NoticeDto,
  PullReport,
  SearchProfile,
  SourceCall,
  SourceStatus,
  StartPullRequest,
} from '@sysdesign/contracts';

import { BUDGET_WINDOW_MS, bucketOf, type BudgetPolicy, type RequestGate } from '../../core/budget';
import { candidateFilterOf, type LeadFilters } from '../../core/candidates';
import { planPulls, resolveWindow } from '../../core/plan';
import type {
  NoticeDescriptions,
  OpportunityRepository,
  OpportunitySearch,
  SourceCallLog,
  StoredDescription,
} from '../../core/ports';
import { validateProfile } from '../../core/profile';
import { runPull } from '../../core/pull';
import { FACTORS, rankLeads, scoreLead } from '../../core/scoring';
import { messageOf } from '../../core/text';
import {
  BUDGET_POLICY,
  CLOCK,
  NOTICE_DESCRIPTIONS,
  OPPORTUNITY_REPOSITORY,
  OPPORTUNITY_SEARCH,
  REQUEST_GATE,
  SEARCH_PROFILES,
  SOURCE_CALL_LOG,
} from './tokens';

/** Everything `GET /leads` may ask: store-side filters, the score cut, the page. */
export interface LeadsOptions extends LeadFilters {
  minScore: number;
  tier: LeadTier | null;
  limit: number;
  offset: number;
}

export interface CallsOptions {
  limit: number;
  offset: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Everything the CLI and the HTTP surface do, over the ports. A pull runs the
 * profile's plan through the gate and stores what normalized; ranking reads
 * the repository — filtered and bounded in SQL — and never a source; a
 * description is one gated request per notice that the row then remembers;
 * every profile is validated at boot so a malformed one fails before any
 * request.
 */
@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private readonly factorIds = FACTORS.map((factor) => factor.id);

  constructor(
    @Inject(OPPORTUNITY_SEARCH) private readonly search: OpportunitySearch,
    @Inject(NOTICE_DESCRIPTIONS) private readonly descriptions: NoticeDescriptions,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(SOURCE_CALL_LOG) private readonly log: SourceCallLog,
    @Inject(SEARCH_PROFILES) private readonly profiles: ReadonlyMap<string, SearchProfile>,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {
    for (const profile of profiles.values()) validateProfile(profile, this.factorIds);
  }

  /** The registry as data — what `GET /profiles` returns. */
  listProfiles(): SearchProfile[] {
    return [...this.profiles.values()];
  }

  profile(id: string): SearchProfile {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new NotFoundException(
        `unknown profile ${id}; known: ${[...this.profiles.keys()].join(', ')}`,
      );
    }
    return profile;
  }

  /** The window is resolved here, with the injected clock; a window the plan cannot run is a 400. */
  async pull(
    profileId: string,
    request: Pick<StartPullRequest, 'days' | 'from' | 'to'>,
  ): Promise<PullReport> {
    const profile = this.profile(profileId);
    let window;
    try {
      window = resolveWindow(request, this.now());
    } catch (error) {
      throw new BadRequestException(messageOf(error));
    }
    const plan = planPulls(profile, window).map((query) => ({ name: null, query }));
    const { slices, stoppedBy } = await runPull(plan, {
      maxPagesPerSlice: profile.pull.maxPagesPerSlice,
      deadlineMs: this.budget.pullDeadlineMs,
      now: this.now,
      search: (query) =>
        this.gate.spend(
          { source: this.search.id, operation: 'search', query, cacheable: true },
          () => this.search.search(query),
        ),
      store: (opportunities, seenAt) => this.repository.upsertMany(opportunities, seenAt),
      warn: (message) => this.logger.warn(message),
    });
    return {
      profile: profile.id,
      window,
      source: { id: this.search.id, availability: this.search.availability },
      slices,
      spent: await this.gate.spent(this.search.id),
      budget: this.dailyBudget(),
      stoppedBy,
    };
  }

  async leads(profileId: string, options: LeadsOptions): Promise<LeadsReport> {
    const profile = this.profile(profileId);
    const now = this.now();
    const { opportunities, capped } = await this.repository.findCandidates(
      candidateFilterOf(profile, options, now),
    );
    const ranked = rankLeads(opportunities, profile, now.getTime());
    const matching = ranked.leads.filter(
      (lead) =>
        lead.score >= options.minScore && (options.tier === null || lead.tier === options.tier),
    );
    return {
      profile: profile.id,
      candidates: opportunities.length,
      capped,
      excluded: ranked.excluded.length,
      matching: matching.length,
      leads: matching.slice(options.offset, options.offset + options.limit),
      limit: options.limit,
      offset: options.offset,
    };
  }

  /** One stored notice, scored, with its description when fetched; null when unknown. */
  async notice(noticeId: string, profileId: string): Promise<NoticeDto | null> {
    const profile = this.profile(profileId);
    const opportunity = await this.repository.findOne(noticeId);
    if (!opportunity) return null;
    const stored = await this.repository.findDescription(noticeId);
    return {
      ...scoreLead(opportunity, profile, this.now().getTime()),
      description: stored ? toDescription(stored) : null,
    };
  }

  /** The upstream and how much of the rolling day's budget is left. */
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

  /**
   * A notice's description: from the row when it was fetched before, else one
   * gated request, then stored. An unknown notice is refused before any
   * request is spent.
   */
  async fetchDescription(noticeId: string): Promise<DescriptionFetch> {
    if ((await this.repository.findOne(noticeId)) === null) {
      throw new NotFoundException(`no stored notice ${noticeId}`);
    }
    const stored = await this.repository.findDescription(noticeId);
    if (stored) return { status: 'ok', description: toDescription(stored) };

    const result = await this.gate.spend(
      {
        source: this.descriptions.id,
        operation: 'description',
        query: { noticeId },
        cacheable: false,
      },
      () => this.descriptions.get(noticeId),
    );
    switch (result.kind) {
      case 'ok': {
        const description: StoredDescription = { text: result.value, fetchedAt: this.now() };
        await this.repository.saveDescription(noticeId, description);
        return { status: 'ok', description: toDescription(description) };
      }
      case 'budget-exhausted':
        return { status: 'budget-exhausted', spent: result.spent, budget: result.budget };
      case 'cached':
        // Not cacheable, so the gate never answers this; the row is the cache.
        return { status: 'error', message: 'unexpected cached description' };
      case 'error':
        this.logger.warn(`description ${noticeId} failed — ${result.outcome}: ${result.message}`);
        return { status: 'error', message: `${result.outcome}: ${result.message}` };
    }
  }

  /** The ledger, newest first. */
  async calls(options: CallsOptions): Promise<[SourceCall[], number]> {
    const [rows, total] = await this.log.list(options.limit, options.offset);
    return [
      rows.map(({ requestedAt, ...row }) => ({ ...row, requestedAt: requestedAt.toISOString() })),
      total,
    ];
  }

  private dailyBudget(): number {
    return bucketOf(this.budget, this.search.id)?.dailyBudget ?? 0;
  }
}

const toDescription = (stored: StoredDescription): Description => ({
  text: stored.text,
  fetchedAt: stored.fetchedAt.toISOString(),
});
