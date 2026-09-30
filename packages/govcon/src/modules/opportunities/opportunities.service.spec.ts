import { NotFoundException } from '@nestjs/common';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import {
  failure,
  InMemoryBidRepository,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  opportunityOf,
  scriptedDescriptions,
  tinyProfile,
  type Scripted,
} from '../../core/testing';
import { ProfilesService } from '../profiles/profiles.service';
import { OpportunitiesService } from './opportunities.service';

const NOW = new Date('2026-09-26T12:00:00Z');

async function harness(
  options: { dailyBudget?: number; descriptions?: readonly Scripted<string>[] } = {},
) {
  const descriptions = scriptedDescriptions('sam.gov', options.descriptions);
  const log = new InMemorySourceCallLog();
  const repository = new InMemoryOpportunityRepository();
  const profileRepository = new InMemoryProfileRepository();
  await profileRepository.insert(tinyProfile(), true, NOW);
  const policy: BudgetPolicy = {
    ttlMs: 0,
    pullDeadlineMs: 120_000,
    buckets: { 'sam.gov': { dailyBudget: options.dailyBudget ?? 10 } },
  };
  const profiles = new ProfilesService(
    profileRepository,
    new InMemorySavedSearchRepository(),
    () => NOW,
  );
  const bids = new InMemoryBidRepository(repository);
  const service = new OpportunitiesService(
    repository,
    bids,
    descriptions,
    new RequestGate(log, policy, () => NOW),
    profiles,
    () => NOW,
  );
  return { bids, descriptions, log, repository, service };
}

const page = { minScore: 0, tier: null, limit: 25, offset: 0 } as const;

describe('the opportunities service', () => {
  it('[GOV-4] [GOV-15] ranks stored candidates offline — no request — over the filters, the score cut and the page', async () => {
    const { descriptions, repository, service } = await harness();
    await repository.upsertMany(
      [
        opportunityOf({ noticeId: 'best' }),
        opportunityOf({
          noticeId: 'weak',
          naicsCode: '722511',
          naicsCodes: [],
          classificationCode: null,
          title: 'Lawn care',
        }),
        opportunityOf({ noticeId: 'gone', setAsideCode: 'HZC' }),
        opportunityOf({ noticeId: 'closed', responseDeadlineAt: '2026-09-01T00:00:00.000Z' }),
        opportunityOf({ noticeId: 'old', postedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      NOW,
    );

    const all = await service.leads(undefined, page);
    expect(descriptions.fetched).toEqual([]);
    // The ineligible set-aside, the passed deadline and the notice beyond the horizon never leave the store.
    expect(all).toMatchObject({
      profile: 'tiny',
      candidates: 2,
      capped: false,
      excluded: 0,
      matching: 2,
      limit: 25,
      offset: 0,
    });
    expect(all.leads.map((lead) => [lead.opportunity.noticeId, lead.tier])).toEqual([
      ['best', 'high'],
      ['weak', 'low'],
    ]);

    expect(
      (await service.leads('tiny', { ...page, tier: 'high' })).leads.map(
        (l) => l.opportunity.noticeId,
      ),
    ).toEqual(['best']);
    const limited = await service.leads('tiny', { ...page, limit: 1 });
    expect(limited.matching).toBe(2);
    expect(limited.leads).toHaveLength(1);
    expect(
      (await service.leads('tiny', { ...page, limit: 1, offset: 1 })).leads.map(
        (l) => l.opportunity.noticeId,
      ),
    ).toEqual(['weak']);
    expect(
      (await service.leads('tiny', { ...page, q: 'lawn' })).leads.map(
        (l) => l.opportunity.noticeId,
      ),
    ).toEqual(['weak']);
    expect((await service.leads('tiny', { ...page, minScore: 90 })).matching).toBe(1);
    await expect(service.leads('nope', page)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows one stored notice with its trace and its description when fetched, or nothing', async () => {
    const { repository, service } = await harness();
    await repository.upsertMany([opportunityOf({ noticeId: 'n-9' })], NOW);
    const notice = await service.notice('n-9', undefined);
    expect(notice?.opportunity.noticeId).toBe('n-9');
    expect(notice?.factors).toHaveLength(8);
    expect(notice?.description).toBeNull();
    expect(notice?.bid).toBeNull();
    expect(await service.notice('missing', 'tiny')).toBeNull();

    await service.fetchDescription('n-9');
    expect((await service.notice('n-9', 'tiny'))?.description).toEqual({
      text: 'Description of n-9',
      fetchedAt: NOW.toISOString(),
    });
  });

  it('[GOV-9] fetches a description once: the store answers afterwards without a request, an unknown notice is refused before any', async () => {
    const { descriptions, log, repository, service } = await harness();
    await repository.upsertMany([opportunityOf({ noticeId: 'n-1' })], NOW);

    const first = await service.fetchDescription('n-1');
    expect(first).toEqual({
      status: 'ok',
      description: { text: 'Description of n-1', fetchedAt: NOW.toISOString() },
    });
    expect(descriptions.fetched).toEqual(['n-1']);
    expect(log.calls.map((call) => call.operation)).toEqual(['description']);

    expect(await service.fetchDescription('n-1')).toEqual(first);
    expect(descriptions.fetched).toEqual(['n-1']);
    expect(log.calls).toHaveLength(1);

    await expect(service.fetchDescription('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(descriptions.fetched).toEqual(['n-1']);
  });

  it('[GOV-9] reports a spent budget and a failed fetch as outcomes, storing nothing', async () => {
    const spent = await harness({ dailyBudget: 0 });
    await spent.repository.upsertMany([opportunityOf({ noticeId: 'n-1' })], NOW);
    expect(await spent.service.fetchDescription('n-1')).toEqual({
      status: 'budget-exhausted',
      spent: 0,
      budget: 0,
    });
    expect(await spent.repository.findDescription('n-1')).toBeNull();

    const { log, repository, service } = await harness({
      descriptions: [failure('invalid-response', 200, 'body is not JSON')],
    });
    await repository.upsertMany([opportunityOf({ noticeId: 'n-2' })], NOW);
    expect(await service.fetchDescription('n-2')).toEqual({
      status: 'error',
      message: 'invalid-response: body is not JSON',
    });
    expect(await repository.findDescription('n-2')).toBeNull();
    expect(log.calls[0]).toMatchObject({ operation: 'description', outcome: 'invalid-response' });
  });
});
