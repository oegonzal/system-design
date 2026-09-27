import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LeadTier } from '@sysdesign/contracts';

import { BUDGET_WINDOW_MS, type BudgetPolicy } from '../../core/budgeted-source';
import { planPulls, type PullWindow } from '../../core/plan';
import type {
  OpportunityRepository,
  OpportunitySource,
  SourceAvailability,
  SourceCallLog,
} from '../../core/ports';
import { validateProfile, type SearchProfile } from '../../core/profile';
import { nextPage, type OpportunityQuery } from '../../core/query';
import { FACTORS, rankLeads, scoreLead, type Lead } from '../../core/scoring';
import {
  BUDGET_POLICY,
  CLOCK,
  OPPORTUNITY_REPOSITORY,
  OPPORTUNITY_SOURCE,
  SEARCH_PROFILES,
  SOURCE_CALL_LOG,
} from './tokens';

export type SliceOutcome = 'ok' | 'cached' | 'budget-exhausted' | 'error' | 'skipped';

export interface SliceReport {
  query: OpportunityQuery;
  outcome: SliceOutcome;
  pages: number;
  /** Records the source returned across the pages fetched. */
  received: number;
  inserted: number;
  updated: number;
  rejected: number;
  /** More records matched than the pages fetched carried. */
  truncated: boolean;
  detail: string | null;
}

export interface PullReport {
  profile: string;
  window: PullWindow;
  source: { id: string; availability: SourceAvailability };
  slices: SliceReport[];
  /** Attempts inside the budget window after this pull, as the ledger counts them; null when it could not be read. */
  spent: number | null;
  budget: number;
  stoppedBy: 'budget' | 'rate-limited' | null;
}

export interface LeadsOptions {
  minScore: number;
  tier: LeadTier | null;
  limit: number;
}

export interface LeadsReport {
  profile: string;
  /** Stored records that were active with an open (or unstated) deadline. */
  candidates: number;
  excluded: number;
  /** Leads over the score and tier filters, before the limit. */
  matching: number;
  leads: Lead[];
}

/**
 * The three things the CLI does, over the ports. A pull runs the profile's
 * plan through the budgeted source and stores what normalized; ranking reads
 * the repository and never the source; every profile is validated at boot so
 * a malformed one fails before any request.
 */
@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private readonly factorIds = FACTORS.map((factor) => factor.id);

  constructor(
    @Inject(OPPORTUNITY_SOURCE) private readonly source: OpportunitySource,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(SOURCE_CALL_LOG) private readonly log: SourceCallLog,
    @Inject(SEARCH_PROFILES) private readonly profiles: ReadonlyMap<string, SearchProfile>,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {
    for (const profile of profiles.values()) validateProfile(profile, this.factorIds);
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

  async pull(profileId: string, window: PullWindow): Promise<PullReport> {
    const profile = this.profile(profileId);
    const plan = planPulls(profile, window);
    const seenAt = this.now();
    const slices: SliceReport[] = [];
    let stoppedBy: PullReport['stoppedBy'] = null;

    for (const first of plan) {
      if (stoppedBy !== null) {
        slices.push(this.slice(first, 'skipped', `stopped earlier: ${stoppedBy}`));
        continue;
      }
      const report = this.slice(first, 'ok', null);
      let query = first;
      for (let page = 0; page < profile.pull.maxPagesPerSlice; page += 1) {
        const result = await this.source.search(query);
        if (result.kind === 'ok') {
          report.pages += 1;
          report.received += result.opportunities.length + result.rejected.length;
          report.rejected += result.rejected.length;
          const summary = await this.repository.upsertMany(result.opportunities, seenAt);
          report.inserted += summary.inserted;
          report.updated += summary.updated;
          const fetched = query.offset + result.opportunities.length + result.rejected.length;
          if (
            fetched >= result.totalRecords ||
            result.opportunities.length + result.rejected.length === 0
          ) {
            break;
          }
          if (page + 1 < profile.pull.maxPagesPerSlice) {
            query = nextPage(query);
            continue;
          }
          report.truncated = true;
          report.detail = `${result.totalRecords - fetched} more record(s) beyond maxPagesPerSlice`;
          break;
        }
        if (result.kind === 'cached') {
          if (report.pages === 0) report.outcome = 'cached';
          report.detail = `pulled ${result.requestedAt}${
            result.recordCount === null ? '' : `, ${result.recordCount} record(s)`
          }`;
          break;
        }
        if (result.kind === 'budget-exhausted') {
          if (report.pages === 0) report.outcome = 'budget-exhausted';
          else report.truncated = true;
          report.detail = `budget ${result.spent}/${result.budget} spent`;
          stoppedBy = 'budget';
          break;
        }
        report.outcome = report.pages === 0 ? 'error' : report.outcome;
        report.detail = `${result.outcome}: ${result.message}`;
        if (result.outcome === 'rate-limited') stoppedBy = 'rate-limited';
        this.logger.warn(`slice ${describeQuery(query)} failed — ${report.detail}`);
        break;
      }
      slices.push(report);
    }

    return {
      profile: profile.id,
      window,
      source: { id: this.source.id, availability: this.source.availability },
      slices,
      spent: await this.spent(),
      budget: this.budget.dailyBudget,
      stoppedBy,
    };
  }

  async leads(profileId: string, options: LeadsOptions): Promise<LeadsReport> {
    const profile = this.profile(profileId);
    const now = this.now();
    const candidates = await this.repository.findCandidates({
      activeOnly: true,
      deadlineOnOrAfter: now,
    });
    const ranked = rankLeads(candidates, profile, now.getTime());
    const matching = ranked.leads.filter(
      (lead) =>
        lead.score >= options.minScore && (options.tier === null || lead.tier === options.tier),
    );
    return {
      profile: profile.id,
      candidates: candidates.length,
      excluded: ranked.excluded.length,
      matching: matching.length,
      leads: matching.slice(0, options.limit),
    };
  }

  async show(noticeId: string, profileId: string): Promise<Lead | null> {
    const profile = this.profile(profileId);
    const opportunity = await this.repository.findOne(noticeId);
    return opportunity ? scoreLead(opportunity, profile, this.now().getTime()) : null;
  }

  private slice(
    query: OpportunityQuery,
    outcome: SliceOutcome,
    detail: string | null,
  ): SliceReport {
    return {
      query,
      outcome,
      pages: 0,
      received: 0,
      inserted: 0,
      updated: 0,
      rejected: 0,
      truncated: false,
      detail,
    };
  }

  private async spent(): Promise<number | null> {
    try {
      return await this.log.countSince(
        this.source.id,
        new Date(this.now().getTime() - BUDGET_WINDOW_MS),
      );
    } catch (error) {
      this.logger.warn(
        `budget not read: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

/** The filters of a query, for a log line or a report row. */
export function describeQuery(query: OpportunityQuery): string {
  const filters = Object.entries(query)
    .filter(([key]) => !['postedFrom', 'postedTo', 'limit', 'offset'].includes(key))
    .map(([key, value]) => `${key}=${String(value)}`);
  const page = query.offset > 0 ? ` page ${Math.floor(query.offset / query.limit) + 1}` : '';
  return `${filters.length > 0 ? filters.join(' ') : 'all notices'}${page}`;
}
