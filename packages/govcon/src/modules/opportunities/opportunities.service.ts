import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Description,
  DescriptionFetch,
  LeadsReport,
  LeadTier,
  NoticeDto,
} from '@sysdesign/contracts';

import type { RequestGate } from '../../core/budget';
import { candidateFilterOf, type LeadFilters } from '../../core/candidates';
import type {
  NoticeDescriptions,
  OpportunityRepository,
  StoredDescription,
} from '../../core/ports';
import { NO_HISTORY, rankLeads, scoreLead, type ScoringContext } from '../../core/scoring';
import { ProfilesService } from '../profiles/profiles.service';
import { CLOCK, NOTICE_DESCRIPTIONS, REQUEST_GATE } from '../sources/tokens';
import { OPPORTUNITY_REPOSITORY } from './tokens';

/** Everything `GET /leads` may ask: store-side filters, the score cut, the page. */
export interface LeadsOptions extends LeadFilters {
  minScore: number;
  tier: LeadTier | null;
  limit: number;
  offset: number;
}

/**
 * The stored notices as leads. Ranking reads the repository — filtered and
 * bounded in SQL — and never a source; a description is one gated request
 * per notice that the row then remembers.
 */
@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(NOTICE_DESCRIPTIONS) private readonly descriptions: NoticeDescriptions,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
    private readonly profiles: ProfilesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async leads(profileId: string | undefined, options: LeadsOptions): Promise<LeadsReport> {
    const profile = await this.profiles.resolve(profileId);
    const now = this.now();
    const { opportunities, capped } = await this.repository.findCandidates(
      candidateFilterOf(profile, options, now),
    );
    const ranked = rankLeads(opportunities, profile, this.context(now));
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
  async notice(noticeId: string, profileId: string | undefined): Promise<NoticeDto | null> {
    const profile = await this.profiles.resolve(profileId);
    const opportunity = await this.repository.findOne(noticeId);
    if (!opportunity) return null;
    const stored = await this.repository.findDescription(noticeId);
    return {
      ...scoreLead(opportunity, profile, this.context(this.now())),
      description: stored ? toDescription(stored) : null,
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

  /** No awards are stored yet; the history factor prices at nothing until they are. */
  private context(now: Date): ScoringContext {
    return { nowMs: now.getTime(), history: NO_HISTORY };
  }
}

const toDescription = (stored: StoredDescription): Description => ({
  text: stored.text,
  fetchedAt: stored.fetchedAt.toISOString(),
});
