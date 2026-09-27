import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  describeQuery,
  type DescriptionDto,
  type DescriptionResultDto,
  type LeadDetailDto,
  type LeadsReport,
  type LeadTier,
  type OpportunityQuery,
  type PullReport,
  type PullWindow,
  type SearchProfile,
  type SliceOutcome,
  type SliceReport,
  type SourceCallDto,
  type SourceStatusDto,
} from '@sysdesign/contracts';

import { BUDGET_WINDOW_MS, type BudgetPolicy } from '../../core/budgeted-source';
import { planPulls } from '../../core/plan';
import type {
  OpportunityRepository,
  OpportunitySource,
  SourceCallLog,
  StoredDescription,
} from '../../core/ports';
import { validateProfile } from '../../core/profile';
import { nextPage } from '../../core/query';
import { FACTORS, rankLeads, scoreLead } from '../../core/scoring';
import {
  BUDGET_POLICY,
  CLOCK,
  OPPORTUNITY_REPOSITORY,
  OPPORTUNITY_SOURCE,
  SEARCH_PROFILES,
  SOURCE_CALL_LOG,
} from './tokens';

export interface LeadsOptions {
  minScore: number;
  tier: LeadTier | null;
  limit: number;
}

export interface CallsOptions {
  limit: number;
  offset: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Everything the CLI and the HTTP surface do, over the ports. A pull runs the
 * profile's plan through the budgeted source and stores what normalized;
 * ranking reads the repository and never the source; a description is one
 * budgeted request per notice that the row then remembers; every profile is
 * validated at boot so a malformed one fails before any request.
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

  async show(noticeId: string, profileId: string): Promise<LeadDetailDto | null> {
    const profile = this.profile(profileId);
    const opportunity = await this.repository.findOne(noticeId);
    if (!opportunity) return null;
    const stored = await this.repository.findDescription(noticeId);
    return {
      ...scoreLead(opportunity, profile, this.now().getTime()),
      description: stored ? toDescriptionDto(stored) : null,
    };
  }

  /** The upstream and how much of the rolling day's budget is left. */
  async status(): Promise<SourceStatusDto> {
    return {
      id: this.source.id,
      availability: this.source.availability,
      budget: {
        spent: await this.spent(),
        limit: this.budget.dailyBudget,
        windowHours: BUDGET_WINDOW_MS / HOUR_MS,
      },
      cacheTtlHours: this.budget.ttlMs / HOUR_MS,
    };
  }

  /**
   * A notice's description: from the row when it was fetched before, else one
   * budgeted request, then stored. An unknown notice is refused before any
   * request is spent.
   */
  async describe(noticeId: string): Promise<DescriptionResultDto> {
    if ((await this.repository.findOne(noticeId)) === null) {
      throw new NotFoundException(`no stored notice ${noticeId}`);
    }
    const stored = await this.repository.findDescription(noticeId);
    if (stored) return { status: 'ok', description: toDescriptionDto(stored) };

    const result = await this.source.describe(noticeId);
    if (result.kind === 'ok') {
      const description: StoredDescription = {
        text: result.text,
        raw: result.raw,
        fetchedAt: this.now(),
      };
      await this.repository.saveDescription(noticeId, description);
      return { status: 'ok', description: toDescriptionDto(description) };
    }
    if (result.kind === 'budget-exhausted') {
      return { status: 'budget-exhausted', spent: result.spent, budget: result.budget };
    }
    this.logger.warn(`description ${noticeId} failed — ${result.outcome}: ${result.message}`);
    return { status: 'error', message: `${result.outcome}: ${result.message}` };
  }

  /** The ledger, newest first. */
  async calls(options: CallsOptions): Promise<[SourceCallDto[], number]> {
    const [rows, total] = await this.log.list(options.limit, options.offset);
    return [rows.map((row) => ({ ...row, requestedAt: row.requestedAt.toISOString() })), total];
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

const toDescriptionDto = (stored: StoredDescription): DescriptionDto => ({
  text: stored.text,
  fetchedAt: stored.fetchedAt.toISOString(),
});
