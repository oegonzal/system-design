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
import { runPull, type PlannedSlice } from '../../core/pull';
import { messageOf } from '../../core/text';
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
 * clock; a window the plan cannot run is a 400.
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
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** The daily pull: every saved search flagged for it. */
  async pull(profileId: string | undefined, request: WindowRequest): Promise<PullReport> {
    const profile = await this.profiles.resolve(profileId);
    const window = this.window(request);
    const searches = await this.savedSearches.listByProfile(profile.id);
    const plan = planPulls(profile, searches, window);
    const report = await this.execute(profile, plan, window);
    await this.savedSearches.markRun(
      searches.filter((search) => search.includedInPull).map((search) => search.id),
      this.now(),
    );
    return report;
  }

  /** One saved search, now, over its own days unless a window is given. */
  async runSaved(searchId: string, request: WindowRequest): Promise<PullReport> {
    const search = await this.searches.get(searchId);
    const profile = await this.profiles.resolve(search.profileId);
    const explicit =
      request.days !== undefined || request.from !== undefined || request.to !== undefined;
    const window = this.window(explicit ? request : { days: search.days });
    const report = await this.execute(
      profile,
      [planSearch(profile, search.name, search.filter, window)],
      window,
    );
    await this.savedSearches.markRun([search.id], this.now());
    return report;
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
      budget: bucketOf(this.budget, this.search.id)?.dailyBudget ?? 0,
      stoppedBy,
    };
  }

  private window(request: WindowRequest): PullWindow {
    try {
      return resolveWindow(request, this.now());
    } catch (error) {
      throw new BadRequestException(messageOf(error));
    }
  }
}
