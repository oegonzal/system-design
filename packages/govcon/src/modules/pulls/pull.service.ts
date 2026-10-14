import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  PullReport,
  PullWindow,
  QueryFilter,
  SearchProfile,
  StartPullRequest,
} from '@sysdesign/contracts';

import { bucketOf, type BudgetPolicy, type RequestGate } from '../../core/budget';
import { planPulls, planSearch, resolveWindow } from '../../core/plan';
import type {
  OpportunityRepository,
  OpportunitySearch,
  SavedSearchRepository,
} from '../../core/ports';
import { runPull, type PlannedSlice, type SliceRun } from '../../core/pull';
import { messageOf } from '../../core/text';
import { yieldOf } from '../../core/yield';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { OPPORTUNITY_REPOSITORY } from '../opportunities/tokens';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchesService } from '../profiles/searches.service';
import { SAVED_SEARCH_REPOSITORY } from '../profiles/tokens';
import { BUDGET_POLICY, CLOCK, OPPORTUNITY_SEARCH, REQUEST_GATE } from '../sources/tokens';

type WindowRequest = Pick<StartPullRequest, 'days' | 'from' | 'to'>;

/**
 * Pulls: the profile's saved searches flagged for it, in order, through the
 * gate, storing what normalized — or one saved search by itself, or one
 * filter never saved. All three are the same run over a different plan and
 * answer the same report. The window is resolved here with the injected
 * clock; a window the plan cannot run is a 400. Every slice that is a saved
 * search is stamped as run, and when it read the source its search keeps
 * what it brought in: how much, how much of it new, and how the profile
 * ranked it.
 */
@Injectable()
export class PullService {
  private readonly logger = new Logger(PullService.name);

  constructor(
    @Inject(OPPORTUNITY_SEARCH) private readonly search: OpportunitySearch,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearches: SavedSearchRepository,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
    private readonly profiles: ProfilesService,
    private readonly searches: SearchesService,
    private readonly opportunities: OpportunitiesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** The daily pull: every saved search flagged for it. */
  async pull(profileId: string | undefined, request: WindowRequest): Promise<PullReport> {
    const profile = await this.profiles.resolve(profileId);
    const window = this.window(request);
    const searches = await this.savedSearches.listByProfile(profile.id);
    return this.execute(profile, planPulls(profile, searches, window), window);
  }

  /** One saved search, now, over its own days unless a window is given. */
  async runSaved(searchId: string, request: WindowRequest): Promise<PullReport> {
    const search = await this.searches.get(searchId);
    const profile = await this.profiles.resolve(search.profileId);
    const explicit =
      request.days !== undefined || request.from !== undefined || request.to !== undefined;
    const window = this.window(explicit ? request : { days: search.days });
    return this.execute(profile, [planSearch(profile, search, search.filter, window)], window);
  }

  /** One filter, now, never saved. */
  async runFilter(
    profileId: string | undefined,
    filter: QueryFilter,
    request: WindowRequest,
  ): Promise<PullReport> {
    const profile = await this.profiles.resolve(profileId);
    const window = this.window(request);
    return this.execute(profile, [planSearch(profile, null, filter, window)], window);
  }

  private async execute(
    profile: SearchProfile,
    plan: readonly PlannedSlice[],
    window: PullWindow,
  ): Promise<PullReport> {
    const startedAt = this.now();
    const { runs, stoppedBy } = await runPull(plan, {
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
    await this.record(profile, runs, window, startedAt);
    return {
      profile: profile.id,
      window,
      source: { id: this.search.id, availability: this.search.availability },
      slices: runs.map((run) => run.report),
      spent: await this.gate.spent(this.search.id),
      budget: bucketOf(this.budget, this.search.id)?.dailyBudget ?? 0,
      stoppedBy,
    };
  }

  /** The saved searches among the slices, each stamped as run then, with its yield when it read the source — ranked once for all of them. */
  private async record(
    profile: SearchProfile,
    runs: readonly SliceRun[],
    window: PullWindow,
    at: Date,
  ): Promise<void> {
    const saved = runs.flatMap((run) =>
      run.slice.searchId === null ? [] : [{ id: run.slice.searchId, run }],
    );
    if (saved.length === 0) return;
    const carried = [...new Set(saved.flatMap(({ run }) => run.noticeIds))];
    const ranked = new Map(
      (await this.opportunities.rankedAmong(profile, carried)).map((lead) => [
        lead.opportunity.noticeId,
        lead,
      ]),
    );
    await this.savedSearches.recordRuns(
      saved.map(({ id, run }) => ({ id, at, yield: yieldOf(run, ranked, window, at) })),
    );
  }

  private window(request: WindowRequest): PullWindow {
    try {
      return resolveWindow(request, this.now());
    } catch (error) {
      throw new BadRequestException(messageOf(error));
    }
  }
}
