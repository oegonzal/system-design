import { NotFoundException } from '@nestjs/common';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { SearchPage } from '../../core/ports';
import type { SearchProfile } from '../../core/profile';
import {
  failure,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  okPage,
  opportunityOf,
  pick,
  scriptedSearch,
  tinyProfile,
  tinySearches,
  type Scripted,
} from '../../core/testing';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchesService } from '../profiles/searches.service';
import { PullService } from './pull.service';

const NOW = new Date('2026-09-26T12:00:00Z');
const window = { from: '2026-09-23', to: '2026-09-26' };

async function harness(
  replies: readonly Scripted<SearchPage>[],
  options: {
    profile?: SearchProfile;
    dailyBudget?: number;
    ttlMs?: number;
    searches?: boolean;
  } = {},
) {
  const inner = scriptedSearch('sam.gov', replies);
  const log = new InMemorySourceCallLog();
  const repository = new InMemoryOpportunityRepository();
  const profileRepository = new InMemoryProfileRepository();
  const searchRepository = new InMemorySavedSearchRepository();
  const policy: BudgetPolicy = {
    ttlMs: options.ttlMs ?? 0,
    pullDeadlineMs: 120_000,
    buckets: { 'sam.gov': { dailyBudget: options.dailyBudget ?? 10 } },
  };
  const profile = options.profile ?? tinyProfile();
  await profileRepository.insert(profile, true, NOW);
  if (options.searches !== false) {
    for (const search of tinySearches(profile.id)) {
      await searchRepository.insert(profile.id, search, NOW);
    }
  }
  const profiles = new ProfilesService(profileRepository, searchRepository, () => NOW);
  const searches = new SearchesService(searchRepository, profiles, () => NOW);
  const service = new PullService(
    inner,
    repository,
    searchRepository,
    policy,
    new RequestGate(log, policy, () => NOW),
    profiles,
    searches,
    () => NOW,
  );
  return { inner, log, repository, searchRepository, service, profile };
}

describe('the pull service', () => {
  it('[GOV-1] [GOV-14] pulls every saved search flagged for the pull, stores what normalized and reports what did not, per slice', async () => {
    const rejected = [{ noticeId: null, issues: ['noticeId: missing'] }];
    const { inner, repository, searchRepository, service } = await harness([
      okPage([opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b' })], 3, rejected),
      okPage([opportunityOf({ noticeId: 'b', title: 'seen twice' })]),
    ]);

    const report = await service.pull(undefined, window);
    expect(inner.queries.map((q) => q.naics)).toEqual(['332710', '5415']);
    expect(
      report.slices.map((s) => [s.name, s.outcome, s.received, s.inserted, s.updated, s.rejected]),
    ).toEqual([
      ['Machine shops', 'ok', 3, 2, 0, 1],
      ['Computer services', 'ok', 1, 0, 1, 0],
    ]);
    expect(report).toMatchObject({
      profile: 'tiny',
      window,
      spent: 2,
      budget: 10,
      stoppedBy: null,
    });
    expect(report.source).toEqual({ id: 'sam.gov', availability: { enabled: true, reason: null } });
    expect(repository.rows.size).toBe(2);
    expect(repository.rows.get('b')?.opportunity.title).toBe('seen twice');
    expect((await searchRepository.listByProfile('tiny')).map((s) => s.lastRunAt)).toEqual([
      NOW,
      NOW,
    ]);
  });

  it('[GOV-14] skips a saved search not flagged for the pull, and pulls nothing for a profile without searches', async () => {
    const { inner, searchRepository, service } = await harness([okPage([])]);
    const first = pick(await searchRepository.listByProfile('tiny'), 0);
    await searchRepository.update(first.id, { ...first, includedInPull: false }, NOW);
    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.name)).toEqual(['Computer services']);
    expect(inner.queries).toHaveLength(1);

    const bare = await harness([okPage([])], { searches: false });
    expect((await bare.service.pull('tiny', window)).slices).toEqual([]);
  });

  it('[GOV-3] stops at the budget: the slice that hit it says so, the rest are skipped, nothing more is called', async () => {
    const { inner, searchRepository, service } = await harness([okPage([opportunityOf()])], {
      dailyBudget: 1,
    });
    await searchRepository.insert(
      'tiny',
      { name: 'Third', filter: { naics: '33' }, days: 3, includedInPull: true, pullOrder: 2 },
      NOW,
    );

    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.outcome)).toEqual(['ok', 'budget-exhausted', 'skipped']);
    expect(report.slices[1]?.detail).toBe('budget 1/1 spent');
    expect(report.slices[2]?.detail).toBe('stopped earlier: budget');
    expect(report.stoppedBy).toBe('budget');
    expect(report.spent).toBe(1);
    expect(inner.queries).toHaveLength(1);
  });

  it('[GOV-3] a rate-limited reply ends the pull and is never retried', async () => {
    const { inner, service } = await harness([failure('rate-limited', 429, 'over quota')]);
    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.outcome)).toEqual(['error', 'skipped']);
    expect(report.slices[0]?.detail).toBe('rate-limited: over quota');
    expect(report.stoppedBy).toBe('rate-limited');
    expect(inner.queries).toHaveLength(1);
  });

  it('[GOV-2] reports a slice pulled inside the cache window as cached and stores nothing again', async () => {
    const { service, repository } = await harness([okPage([opportunityOf()])], { ttlMs: 60_000 });
    const first = await service.pull('tiny', window);
    expect(first.slices.map((s) => s.outcome)).toEqual(['ok', 'ok']);
    expect(first.spent).toBe(2);
    repository.rows.clear();
    const second = await service.pull('tiny', window);
    expect(second.slices.map((s) => s.outcome)).toEqual(['cached', 'cached']);
    expect(second.slices[0]?.detail).toBe('pulled 2026-09-26T12:00:00.000Z, 1 record(s)');
    expect(repository.rows.size).toBe(0);
    expect(second.spent).toBe(2);
  });

  it('[GOV-14] runs one saved search over its own days, or an explicit window, and stamps it', async () => {
    const { inner, searchRepository, service } = await harness([okPage([opportunityOf()])]);
    const first = pick(await searchRepository.listByProfile('tiny'), 0);
    const report = await service.runSaved(first.id, {});
    expect(report.slices.map((s) => [s.name, s.outcome])).toEqual([['Machine shops', 'ok']]);
    expect(report.window).toEqual({ from: '2026-09-23', to: '2026-09-26' });
    expect(inner.queries[0]).toMatchObject({ naics: '332710', postedFrom: '2026-09-23' });
    expect((await searchRepository.find(first.id))?.lastRunAt).toEqual(NOW);

    const explicit = await service.runSaved(first.id, { days: 1 });
    expect(explicit.window).toEqual({ from: '2026-09-25', to: '2026-09-26' });
    await expect(service.runSaved('nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('runs a filter once without saving it, and refuses a window the plan cannot run', async () => {
    const { inner, searchRepository, service } = await harness([okPage([])]);
    const report = await service.runFilter(
      undefined,
      { naics: '541511', status: 'active' },
      { days: 7 },
    );
    expect(report.slices.map((s) => [s.name, s.outcome])).toEqual([[null, 'ok']]);
    expect(inner.queries[0]).toMatchObject({
      naics: '541511',
      status: 'active',
      postedFrom: '2026-09-19',
    });
    expect(await searchRepository.listByProfile('tiny')).toHaveLength(2);
    await expect(service.pull('tiny', { from: '2026-09-27', to: '2026-09-26' })).rejects.toThrow(
      /starts after it ends/,
    );
    await expect(service.pull('nope', window)).rejects.toBeInstanceOf(NotFoundException);
  });
});
