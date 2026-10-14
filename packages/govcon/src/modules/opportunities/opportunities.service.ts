import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MAX_AWARD_LIMIT,
  MAX_CANDIDATES,
  type Bid,
  type Description,
  type DescriptionFetch,
  type Lead,
  type LeadsReport,
  type LeadTier,
  type NoticeAwards,
  type NoticeDto,
  type Opportunity,
  type SearchProfile,
} from '@sysdesign/contracts';

import type { RequestGate } from '../../core/budget';
import { candidateFilterOf, type LeadFilters } from '../../core/candidates';
import { awardHistoryOf, summarizeAwards } from '../../core/intel';
import type {
  AwardRepository,
  BidRecord,
  BidRepository,
  NoticeDescriptions,
  OpportunityRepository,
  StoredDescription,
} from '../../core/ports';
import { rankLeads, scoreLead, type ScoringContext } from '../../core/scoring';
import { AWARD_REPOSITORY } from '../awards/tokens';
import { ProfilesService } from '../profiles/profiles.service';
import { CLOCK, NOTICE_DESCRIPTIONS, REQUEST_GATE } from '../sources/tokens';
import { BID_REPOSITORY, OPPORTUNITY_REPOSITORY } from './tokens';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything `GET /leads` may ask: store-side filters, the score cut, the page. */
export interface LeadsOptions extends LeadFilters {
  minScore: number;
  tier: LeadTier | null;
  limit: number;
  offset: number;
}

/** A profile's stored candidates, scored: the leads in rank order, what a gate excluded, and whether the store's bound cut the set. */
export interface Ranking {
  leads: Lead[];
  excluded: Lead[];
  candidates: number;
  capped: boolean;
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
    @Inject(BID_REPOSITORY) private readonly bids: BidRepository,
    @Inject(AWARD_REPOSITORY) private readonly awards: AwardRepository,
    @Inject(NOTICE_DESCRIPTIONS) private readonly descriptions: NoticeDescriptions,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
    private readonly profiles: ProfilesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** A profile's candidates out of the store, every one scored: the ranking the leads list cuts and pages, and the one the lead alerts read. */
  async ranked(profile: SearchProfile, filters: LeadFilters = {}): Promise<Ranking> {
    const now = this.now();
    const { opportunities, capped } = await this.repository.findCandidates(
      candidateFilterOf(profile, filters, now),
    );
    return {
      ...rankLeads(opportunities, profile, await this.context(profile, now)),
      candidates: opportunities.length,
      capped,
    };
  }

  /**
   * Of these stored notices, the ones the profile's leads list would show,
   * scored — what a run's yield is counted over. Asked for a bounded number
   * at a time, so no read is cut by the store's own bound.
   */
  async rankedAmong(profile: SearchProfile, noticeIds: readonly string[]): Promise<Lead[]> {
    // A pull answered wholly from the cache window carried nothing: no read at all.
    if (noticeIds.length === 0) return [];
    const now = this.now();
    const filter = candidateFilterOf(profile, {}, now);
    const context = await this.context(profile, now);
    const leads: Lead[] = [];
    for (let start = 0; start < noticeIds.length; start += MAX_CANDIDATES) {
      const { opportunities } = await this.repository.findCandidates({
        ...filter,
        noticeIds: noticeIds.slice(start, start + MAX_CANDIDATES),
      });
      leads.push(...rankLeads(opportunities, profile, context).leads);
    }
    return leads;
  }

  async leads(profileId: string | undefined, options: LeadsOptions): Promise<LeadsReport> {
    const profile = await this.profiles.resolve(profileId);
    const ranked = await this.ranked(profile, options);
    const matching = ranked.leads.filter(
      (lead) =>
        lead.score >= options.minScore && (options.tier === null || lead.tier === options.tier),
    );
    return {
      profile: profile.id,
      candidates: ranked.candidates,
      capped: ranked.capped,
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
    const now = this.now();
    const [stored, bid, context, awards] = await Promise.all([
      this.repository.findDescription(noticeId),
      this.bids.find(noticeId),
      this.context(profile, now),
      this.noticeAwards(opportunity, profile, now),
    ]);
    return {
      ...scoreLead(opportunity, profile, context),
      description: stored ? toDescription(stored) : null,
      attachments: opportunity.resourceLinks.map((url, ordinal) => ({ ordinal, url })),
      bid: bid ? toBid(bid) : null,
      awards,
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

  /** The instant and the stored awards inside the profile's history window, indexed for the history factor. */
  private async context(profile: SearchProfile, now: Date): Promise<ScoringContext> {
    const since = new Date(now.getTime() - profile.scoring.history.days * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return {
      nowMs: now.getTime(),
      history: awardHistoryOf(await this.awards.history(since), now.getTime()),
    };
  }

  /** The awards of the notice's own solicitation, then the summary of its NAICS inside the history window. */
  private async noticeAwards(
    opportunity: Opportunity,
    profile: SearchProfile,
    now: Date,
  ): Promise<NoticeAwards> {
    const none = {
      naicsPrefix: null,
      pscPrefix: null,
      agencyContains: null,
      solicitationNumber: null,
      awardeeUei: null,
      signedFrom: null,
      signedTo: null,
      source: null,
    };
    const since = new Date(now.getTime() - profile.scoring.history.days * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const [bySolicitation, related] = await Promise.all([
      opportunity.solicitationNumber === null
        ? Promise.resolve([])
        : this.awards.findMatching(
            { ...none, solicitationNumber: opportunity.solicitationNumber },
            MAX_AWARD_LIMIT,
          ),
      opportunity.naicsCode === null
        ? Promise.resolve([])
        : this.awards.findMatching(
            { ...none, naicsPrefix: opportunity.naicsCode, signedFrom: since },
            MAX_AWARD_LIMIT,
          ),
    ]);
    return { bySolicitation, related: summarizeAwards(related) };
  }
}

/** The wire shape of a stored bid; the bids module's service is the other user. */
export const toBid = (record: BidRecord): Bid => ({
  noticeId: record.noticeId,
  stage: record.stage,
  notes: record.notes,
  reminderAt: record.reminderAt === null ? null : record.reminderAt.toISOString(),
  estimatedValue: record.estimatedValue,
  stageChangedAt: record.stageChangedAt.toISOString(),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const toDescription = (stored: StoredDescription): Description => ({
  text: stored.text,
  fetchedAt: stored.fetchedAt.toISOString(),
});
