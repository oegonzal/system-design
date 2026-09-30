import { awardOf } from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { AwardPage } from '../../core/ports';
import {
  awardDraftOf,
  awardPageOf,
  failure,
  InMemoryAwardRepository,
  InMemorySourceCallLog,
  scriptedContractAwards,
  scriptedSpendingAwards,
  type Scripted,
} from '../../core/testing';
import { AwardsService } from './awards.service';

const NOW = new Date('2026-09-26T12:00:00Z');
const draft = (externalId: string, overrides = {}) => awardDraftOf({ externalId, ...overrides });

function harness(
  sam: readonly Scripted<AwardPage>[],
  spending: readonly Scripted<AwardPage>[] = [awardPageOf([])],
  dailyBudget = 10,
) {
  const contractAwards = scriptedContractAwards(sam);
  const spendingAwards = scriptedSpendingAwards(spending);
  const log = new InMemorySourceCallLog();
  const awards = new InMemoryAwardRepository();
  const policy: BudgetPolicy = {
    ttlMs: 0,
    pullDeadlineMs: 1,
    buckets: { 'sam.gov': { dailyBudget } },
  };
  const service = new AwardsService(
    awards,
    contractAwards,
    spendingAwards,
    policy,
    new RequestGate(log, policy, () => NOW),
    () => NOW,
  );
  return { service, awards, log, contractAwards, spendingAwards };
}

describe('the awards service', () => {
  it('[GOV-17] fetches one gated page per code from SAM.gov and one from USAspending, dedupes by source and id, and stamps the fetch', async () => {
    const { service, awards, log, contractAwards, spendingAwards } = harness(
      [awardPageOf([draft('a'), draft('b')]), awardPageOf([draft('b', { amount: 999 })])],
      [awardPageOf([draft('u', { source: 'usaspending' })])],
    );
    const report = await service.fetch({
      naics: ['332710', '541511'],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov', 'usaspending'],
    });
    expect(
      report.slices.map((s) => [
        s.source,
        s.code,
        s.outcome,
        s.pages,
        s.received,
        s.inserted,
        s.updated,
      ]),
    ).toEqual([
      ['sam.gov', '332710', 'ok', 1, 2, 2, 0],
      ['sam.gov', '541511', 'ok', 1, 1, 0, 1],
      ['usaspending', '332710,541511', 'ok', 1, 1, 1, 0],
    ]);
    expect(report).toMatchObject({ spent: 2, budget: 10 });
    expect(contractAwards.requests.map((r) => [r.naics, r.offset])).toEqual([
      ['332710', 0],
      ['541511', 0],
    ]);
    expect(spendingAwards.requests[0]).toMatchObject({ naics: ['332710', '541511'], page: 1 });
    expect(log.calls.map((call) => [call.source, call.operation])).toEqual([
      ['sam.gov', 'awards'],
      ['sam.gov', 'awards'],
      ['usaspending', 'spending'],
    ]);
    expect(awards.rows.size).toBe(3);
    expect(awards.rows.get('sam.gov:b')).toMatchObject({
      amount: 999,
      fetchedAt: NOW.toISOString(),
    });
  });

  it('[GOV-17] pages up to the bound, stops the SAM.gov slices at the budget, and lets a failed slice fail alone', async () => {
    const paged = harness([
      awardPageOf([draft('p1')], { hasMore: true }),
      awardPageOf([draft('p2')], { hasMore: true }),
      awardPageOf([draft('p3')], { hasMore: true }),
    ]);
    const report = await paged.service.fetch({
      naics: ['33'],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov'],
    });
    expect(report.slices[0]).toMatchObject({
      pages: 3,
      received: 3,
      truncated: true,
      detail: 'more pages beyond 3',
    });
    expect(paged.contractAwards.requests.map((r) => r.offset)).toEqual([0, 100, 200]);

    const spent = harness([awardPageOf([draft('x')])], [awardPageOf([])], 1);
    const stopped = await spent.service.fetch({
      naics: ['11', '22', '33'],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov', 'usaspending'],
    });
    expect(stopped.slices.map((s) => [s.source, s.outcome, s.detail])).toEqual([
      ['sam.gov', 'ok', null],
      ['sam.gov', 'budget-exhausted', 'budget 1/1 spent'],
      ['sam.gov', 'skipped', 'stopped earlier'],
      ['usaspending', 'ok', null],
    ]);

    const failing = harness([failure('error', 500, 'status 500'), awardPageOf([draft('y')])]);
    const partial = await failing.service.fetch({
      naics: ['11', '22'],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov'],
    });
    expect(partial.slices.map((s) => [s.outcome, s.detail])).toEqual([
      ['error', 'error: status 500'],
      ['ok', null],
    ]);
  });

  it('lists and summarizes the store over the filters without spending', async () => {
    const { service, awards, log } = harness([]);
    await awards.upsertMany([
      awardOf({ externalId: 'a', signedAt: '2026-06-01', naicsCode: '332710' }),
      awardOf({
        externalId: 'b',
        signedAt: '2026-07-01',
        naicsCode: '541511',
        pscCode: 'DA01',
        amount: 10,
      }),
      awardOf({
        externalId: 'c',
        signedAt: '2026-08-01',
        source: 'usaspending',
        awardeeUei: 'ZZZ',
      }),
    ]);
    const [page, total] = await service.list({ naics: '3327' }, 10, 0);
    expect(total).toBe(2);
    expect(page.map((a) => a.externalId)).toEqual(['c', 'a']);
    expect((await service.list({}, 2, 1))[0].map((a) => a.externalId)).toEqual(['b', 'a']);
    expect((await service.summary({ psc: 'DA' })).total).toBe(10);
    expect((await service.summary({ source: 'usaspending' })).bySource).toEqual({
      'sam.gov': 0,
      usaspending: 1,
    });
    expect((await service.summary({ from: '2026-07-01', to: '2026-07-31' })).count).toBe(1);
    expect(log.calls).toHaveLength(0);
  });
});
