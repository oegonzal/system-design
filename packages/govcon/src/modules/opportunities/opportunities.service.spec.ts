import { NotFoundException } from '@nestjs/common';

import { BudgetedSource } from '../../core/budgeted-source';
import type { SourceResult } from '../../core/ports';
import type { SearchProfile } from '../../core/profile';
import {
  fetched,
  InMemoryOpportunityRepository,
  InMemorySourceCallLog,
  okResult,
  scriptedSource,
  tinyProfile,
} from '../../core/testing';
import { OpportunitiesService } from './opportunities.service';

const NOW = new Date('2026-09-26T12:00:00Z');
const window = { from: '2026-09-23', to: '2026-09-26' };

function harness(
  replies: readonly SourceResult[],
  options: { profile?: SearchProfile; dailyBudget?: number; ttlMs?: number } = {},
) {
  const inner = scriptedSource('sam.gov', replies);
  const log = new InMemorySourceCallLog();
  const repository = new InMemoryOpportunityRepository();
  const policy = { dailyBudget: options.dailyBudget ?? 10, ttlMs: options.ttlMs ?? 0 };
  const source = new BudgetedSource(inner, log, policy, () => NOW);
  const profile = options.profile ?? tinyProfile();
  const service = new OpportunitiesService(
    source,
    repository,
    log,
    new Map([[profile.id, profile]]),
    policy,
    () => NOW,
  );
  return { inner, log, repository, service, profile };
}

describe('the opportunities service', () => {
  it('[GOV-1] pulls every slice, stores what normalized and reports what did not, per slice', async () => {
    const rejected = [{ noticeId: null, issues: ['noticeId: missing'] }];
    const { inner, repository, service } = harness([
      okResult([fetched({ noticeId: 'a' }), fetched({ noticeId: 'b' })], 3, rejected),
      okResult([fetched({ noticeId: 'b', title: 'seen twice' })]),
    ]);

    const report = await service.pull('tiny', window);
    expect(inner.queries.map((q) => q.naics)).toEqual(['332710', '5415']);
    expect(
      report.slices.map((s) => [s.outcome, s.received, s.inserted, s.updated, s.rejected]),
    ).toEqual([
      ['ok', 3, 2, 0, 1],
      ['ok', 1, 0, 1, 0],
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
  });

  it('[GOV-3] stops at the budget: the slice that hit it says so, the rest are skipped, nothing more is called', async () => {
    const profile = tinyProfile({
      pull: {
        slices: [{ naics: '11' }, { naics: '22' }, { naics: '33' }],
        pageSize: 100,
        maxPagesPerSlice: 1,
      },
    });
    const { inner, service } = harness([okResult([fetched()])], { profile, dailyBudget: 1 });

    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.outcome)).toEqual(['ok', 'budget-exhausted', 'skipped']);
    expect(report.slices[1]?.detail).toBe('budget 1/1 spent');
    expect(report.slices[2]?.detail).toBe('stopped earlier: budget');
    expect(report.stoppedBy).toBe('budget');
    expect(report.spent).toBe(1);
    expect(inner.queries).toHaveLength(1);
  });

  it('[GOV-3] a rate-limited reply ends the pull and is never retried', async () => {
    const limited: SourceResult = {
      kind: 'error',
      outcome: 'rate-limited',
      status: 429,
      message: 'over quota',
    };
    const { inner, service } = harness([limited]);
    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.outcome)).toEqual(['error', 'skipped']);
    expect(report.slices[0]?.detail).toBe('rate-limited: over quota');
    expect(report.stoppedBy).toBe('rate-limited');
    expect(inner.queries).toHaveLength(1);
  });

  it('[GOV-2] reports a slice pulled inside the cache window as cached and stores nothing again', async () => {
    const { service, repository } = harness([okResult([fetched()])], { ttlMs: 60_000 });
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

  it('pages a slice up to maxPagesPerSlice and reports what remains as truncated', async () => {
    const profile = tinyProfile({ pull: { slices: [{}], pageSize: 2, maxPagesPerSlice: 2 } });
    const { inner, service } = harness(
      [
        okResult([fetched({ noticeId: 'a' }), fetched({ noticeId: 'b' })], 5),
        okResult([fetched({ noticeId: 'c' }), fetched({ noticeId: 'd' })], 5),
      ],
      { profile },
    );
    const report = await service.pull('tiny', window);
    expect(inner.queries.map((q) => q.offset)).toEqual([0, 2]);
    expect(report.slices[0]).toMatchObject({
      outcome: 'ok',
      pages: 2,
      received: 4,
      inserted: 4,
      truncated: true,
      detail: '1 more record(s) beyond maxPagesPerSlice',
    });
  });

  it('stops paging when a page reports the total reached', async () => {
    const profile = tinyProfile({ pull: { slices: [{}], pageSize: 2, maxPagesPerSlice: 5 } });
    const { inner, service } = harness(
      [
        okResult([fetched({ noticeId: 'a' }), fetched({ noticeId: 'b' })], 3),
        okResult([fetched({ noticeId: 'c' })], 3),
      ],
      { profile },
    );
    const report = await service.pull('tiny', window);
    expect(inner.queries).toHaveLength(2);
    expect(report.slices[0]).toMatchObject({ pages: 2, received: 3, truncated: false });
  });

  it('[GOV-4] ranks stored candidates offline — no request — over the score and tier filters and the limit', async () => {
    const { inner, repository, service } = harness([]);
    await repository.upsertMany(
      [
        fetched({ noticeId: 'best' }),
        fetched({
          noticeId: 'weak',
          naicsCode: '722511',
          naicsCodes: [],
          classificationCode: null,
          title: 'Lawn care',
        }),
        fetched({ noticeId: 'gone', setAsideCode: 'HZC' }),
        fetched({ noticeId: 'closed', responseDeadlineAt: '2026-09-01T00:00:00.000Z' }),
      ],
      NOW,
    );

    const all = await service.leads('tiny', { minScore: 0, tier: null, limit: 25 });
    expect(inner.queries).toHaveLength(0);
    expect(all).toMatchObject({ candidates: 3, excluded: 1, matching: 2 });
    expect(all.leads.map((lead) => [lead.opportunity.noticeId, lead.tier])).toEqual([
      ['best', 'high'],
      ['weak', 'low'],
    ]);

    const high = await service.leads('tiny', { minScore: 0, tier: 'high', limit: 25 });
    expect(high.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['best']);
    const limited = await service.leads('tiny', { minScore: 0, tier: null, limit: 1 });
    expect(limited.matching).toBe(2);
    expect(limited.leads).toHaveLength(1);
    const strict = await service.leads('tiny', { minScore: 90, tier: null, limit: 25 });
    expect(strict.matching).toBe(1);
  });

  it('shows one stored notice with its trace, or nothing', async () => {
    const { repository, service } = harness([]);
    await repository.upsertMany([fetched({ noticeId: 'n-9' })], NOW);
    const lead = await service.show('n-9', 'tiny');
    expect(lead?.opportunity.noticeId).toBe('n-9');
    expect(lead?.factors).toHaveLength(6);
    expect(await service.show('missing', 'tiny')).toBeNull();
  });

  it('[GOV-5] refuses to boot on a malformed profile, and names an unknown one', async () => {
    const broken = tinyProfile({ scoring: { ...tinyProfile().scoring, weights: { naics: 1 } } });
    expect(() => harness([], { profile: broken })).toThrow(
      /profile tiny: scoring.weights must name exactly/,
    );
    const { service } = harness([]);
    await expect(
      service.leads('nope', { minScore: 0, tier: null, limit: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
