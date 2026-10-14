import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { SearchPage } from '../../core/ports';
import type { SearchProfile } from '../../core/profile';
import {
  InMemoryAwardRepository,
  InMemoryBidRepository,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  scriptedDescriptions,
  scriptedSearch,
  tinyProfile,
  tinySearches,
  type Scripted,
} from '../../core/testing';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchesService } from '../profiles/searches.service';
import { PullService } from './pull.service';

/**
 * The pull over fakes, for its specs and its scheduler's: the real services,
 * gate and core, with the search scripted and every store in memory. No
 * vitest imports: a spec asserts, this only builds.
 */

/** The fixed instant a pull starts at, until a spec moves the clock on. */
export const NOW = new Date('2026-09-26T12:00:00Z');

export interface PullHarnessOptions {
  /** The profile stored as the default with its two searches; null stores none. */
  profile?: SearchProfile | null;
  dailyBudget?: number;
  ttlMs?: number;
  /** False stores the profile without its searches. */
  searches?: boolean;
  /** False builds a source with no key. */
  enabled?: boolean;
}

export async function pullHarness(
  replies: readonly Scripted<SearchPage>[],
  options: PullHarnessOptions = {},
) {
  let now = NOW;
  const clock = () => now;
  const inner = scriptedSearch('sam.gov', replies, options.enabled ?? true);
  const log = new InMemorySourceCallLog();
  const repository = new InMemoryOpportunityRepository();
  const profileRepository = new InMemoryProfileRepository();
  const searchRepository = new InMemorySavedSearchRepository();
  const policy: BudgetPolicy = {
    ttlMs: options.ttlMs ?? 0,
    pullDeadlineMs: 120_000,
    buckets: { 'sam.gov': { dailyBudget: options.dailyBudget ?? 10 } },
  };
  const profile = options.profile === undefined ? tinyProfile() : options.profile;
  if (profile !== null) {
    await profileRepository.insert(profile, true, NOW);
    if (options.searches !== false) {
      for (const search of tinySearches(profile.id)) {
        await searchRepository.insert(profile.id, search, NOW);
      }
    }
  }
  const gate = new RequestGate(log, policy, clock);
  const profiles = new ProfilesService(profileRepository, searchRepository, clock);
  const opportunities = new OpportunitiesService(
    repository,
    new InMemoryBidRepository(repository),
    new InMemoryAwardRepository(),
    scriptedDescriptions('sam.gov'),
    gate,
    profiles,
    clock,
  );
  const service = new PullService(
    inner,
    repository,
    searchRepository,
    policy,
    gate,
    profiles,
    new SearchesService(searchRepository, profiles, clock),
    opportunities,
    clock,
  );
  return {
    inner,
    log,
    repository,
    searchRepository,
    service,
    opportunities,
    profiles,
    clock,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}
