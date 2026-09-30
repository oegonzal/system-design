import type { OpportunityQuery } from '@sysdesign/contracts';

import {
  attempted,
  failure,
  InMemorySourceCallLog,
  okPage,
  okText,
  operationOf,
  opportunityOf,
  scriptedDescriptions,
  scriptedSearch,
  type Scripted,
} from '../testing';
import type { Fetched } from './gate';
import { RequestGate } from './gate';
import { BUDGET_WINDOW_MS, type BudgetPolicy } from './policy';
import type { SearchPage } from '../ports';

const query: OpportunityQuery = {
  postedFrom: '2026-09-20',
  postedTo: '2026-09-26',
  limit: 1000,
  offset: 0,
  naics: '332710',
};
const HOUR = 60 * 60 * 1000;

const policyOf = (overrides: Partial<BudgetPolicy> = {}): BudgetPolicy => ({
  ttlMs: 24 * HOUR,
  pullDeadlineMs: 120_000,
  buckets: { 'sam.gov': { dailyBudget: 3 } },
  ...overrides,
});

function harness(replies: readonly Scripted<SearchPage>[], policy = policyOf()) {
  const search = scriptedSearch('sam.gov', replies);
  const descriptions = scriptedDescriptions('sam.gov');
  const log = new InMemorySourceCallLog();
  let nowMs = Date.parse('2026-09-26T12:00:00Z');
  const warnings: string[] = [];
  const gate = new RequestGate(
    log,
    policy,
    () => new Date(nowMs),
    (m) => warnings.push(m),
  );
  const spendSearch = (q: OpportunityQuery = query) =>
    gate.spend({ source: 'sam.gov', operation: 'search', query: q, cacheable: true }, () =>
      search.search(q),
    );
  const spendDescription = (noticeId: string) =>
    gate.spend(
      { source: 'sam.gov', operation: 'description', query: { noticeId }, cacheable: false },
      () => descriptions.get(noticeId),
    );
  return {
    search,
    descriptions,
    log,
    gate,
    warnings,
    spendSearch,
    spendDescription,
    advance: (ms: number) => (nowMs += ms),
  };
}

describe('the request gate', () => {
  it('[GOV-2] answers a query pulled inside the cache window from the log, calling nothing', async () => {
    const opportunities = [opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b' })];
    const { search, log, spendSearch, advance } = harness([okPage(opportunities)]);

    expect(await spendSearch()).toEqual({
      kind: 'ok',
      value: { opportunities, rejected: [], totalRecords: 2 },
    });
    expect(search.queries).toHaveLength(1);
    expect(log.calls).toHaveLength(1);
    expect(log.calls[0]).toMatchObject({
      operation: 'search',
      attempt: 1,
      outcome: 'ok',
      status: 200,
      totalRecords: 2,
      recordCount: 2,
    });

    advance(HOUR);
    const again = await spendSearch();
    expect(again).toEqual({
      kind: 'cached',
      recordCount: 2,
      requestedAt: '2026-09-26T12:00:00.000Z',
    });
    expect(search.queries).toHaveLength(1);
    expect(log.calls).toHaveLength(1);

    // A different page is a different query.
    await spendSearch({ ...query, offset: 1000 });
    expect(search.queries).toHaveLength(2);
  });

  it('[GOV-2] calls again once the window has passed, and never caches when the ttl is zero', async () => {
    const { search, spendSearch, advance } = harness([okPage([])]);
    await spendSearch();
    advance(24 * HOUR + 1);
    expect((await spendSearch()).kind).toBe('ok');
    expect(search.queries).toHaveLength(2);

    const uncached = harness([okPage([])], policyOf({ ttlMs: 0 }));
    await uncached.spendSearch();
    await uncached.spendSearch();
    expect(uncached.search.queries).toHaveLength(2);
  });

  it('[GOV-3] stops at the budget over a rolling day — errors and rate limits count as attempts', async () => {
    const rateLimited = failure('rate-limited', 429, 'over quota');
    const { search, log, spendSearch, advance } = harness(
      [okPage([]), rateLimited, okPage([]), okPage([])],
      policyOf({ ttlMs: 0 }),
    );
    await spendSearch();
    expect(await spendSearch()).toEqual(rateLimited);
    await spendSearch();
    expect(search.queries).toHaveLength(3);
    expect(log.calls.map((call) => call.outcome)).toEqual(['ok', 'rate-limited', 'ok']);
    expect(log.calls[1]).toMatchObject({ status: 429, error: 'over quota', totalRecords: null });

    expect(await spendSearch()).toEqual({ kind: 'budget-exhausted', spent: 3, budget: 3 });
    expect(search.queries).toHaveLength(3);

    advance(BUDGET_WINDOW_MS + 1);
    expect((await spendSearch()).kind).toBe('ok');
    expect(search.queries).toHaveLength(4);
  });

  it('[GOV-10] records one row per attempt: a 5xx then a 200 is two rows under one key, numbered', async () => {
    const page = okPage([opportunityOf()]);
    const t0 = new Date('2026-09-26T12:00:00Z');
    const t1 = new Date('2026-09-26T12:00:02Z');
    const { log, spendSearch } = harness([
      attempted(page, [
        { startedAt: t0, durationMs: 40, status: 503, outcome: 'error', error: 'status 503' },
        { startedAt: t1, durationMs: 90, status: 200, outcome: 'ok', error: null },
      ]),
    ]);
    expect((await spendSearch()).kind).toBe('ok');
    expect(log.calls).toHaveLength(2);
    expect(
      log.calls.map((call) => [call.attempt, call.status, call.outcome, call.recordCount]),
    ).toEqual([
      [1, 503, 'error', null],
      [2, 200, 'ok', 1],
    ]);
    expect(log.calls[0]?.queryKey).toBe(log.calls[1]?.queryKey);
    expect(log.calls.map((call) => call.requestedAt)).toEqual([t0, t1]);
    // Both attempts spent the bucket.
    expect(await log.countSince('sam.gov', new Date(0))).toBe(2);
  });

  it('[GOV-10] a call that made no attempt leaves no row and spends nothing', async () => {
    const disabled: Fetched<SearchPage> = failure('error', null, 'SAM_GOV_API_KEY is not set');
    const { log, spendSearch } = harness([attempted(disabled, [])]);
    expect(await spendSearch()).toEqual(disabled);
    expect(log.calls).toHaveLength(0);
  });

  it('[GOV-11] every operation spends one bucket per source, and an unlisted source is ledgered but unbudgeted', async () => {
    const { log, spendSearch, spendDescription, descriptions } = harness(
      [okPage([])],
      policyOf({ ttlMs: 0, buckets: { 'sam.gov': { dailyBudget: 2 } } }),
    );
    await spendSearch();
    expect(await spendDescription('n-1')).toEqual({ kind: 'ok', value: 'Description of n-1' });
    expect(await spendDescription('n-2')).toEqual({
      kind: 'budget-exhausted',
      spent: 2,
      budget: 2,
    });
    expect(descriptions.fetched).toEqual(['n-1']);
    expect(log.calls.map((call) => call.operation)).toEqual(['search', 'description']);

    const free = scriptedDescriptions('usaspending', [okText('x')]);
    const gate = new RequestGate(log, policyOf({ buckets: {} }), () => new Date(0));
    for (let i = 0; i < 5; i += 1) {
      expect(
        (
          await gate.spend(
            {
              source: 'usaspending',
              operation: 'spending',
              query: {
                naics: [],
                psc: [],
                from: '2026-01-01',
                to: '2026-02-01',
                page: 1,
                limit: 100,
              },
              cacheable: false,
            },
            () => free.get('x'),
          )
        ).kind,
      ).toBe('ok');
    }
    expect(await log.countSince('usaspending', new Date(0))).toBe(5);
  });

  it('[GOV-2] treats a log that cannot answer as empty: the source is called and the failure is a warning', async () => {
    const { search, log, spendSearch, warnings } = harness([
      okPage([opportunityOf({ noticeId: 'a' })]),
    ]);
    log.failing = new Error('connection refused');

    const result = await spendSearch();
    expect(result.kind).toBe('ok');
    expect(search.queries).toHaveLength(1);
    expect(warnings).toEqual([
      'call log fresh call not read: connection refused',
      'call log call count not read: connection refused',
      'call log not written: connection refused',
    ]);
  });

  it('[GOV-9] budgets a description like a page, records it as one, and never consults the search cache', async () => {
    const { descriptions, log, spendSearch, spendDescription } = harness(
      [okPage([])],
      policyOf({ buckets: { 'sam.gov': { dailyBudget: 2 } } }),
    );
    await spendSearch();
    expect(await spendDescription('n-7')).toEqual({ kind: 'ok', value: 'Description of n-7' });
    expect(descriptions.fetched).toEqual(['n-7']);
    expect(log.calls[1]).toMatchObject({
      operation: 'description',
      outcome: 'ok',
      status: 200,
      recordCount: 1,
      totalRecords: null,
    });
    expect(operationOf(log.calls[1]!)).toEqual({
      operation: 'description',
      query: { noticeId: 'n-7' },
    });
    expect(log.calls[1]?.queryKey).not.toBe(log.calls[0]?.queryKey);

    // The same notice again inside the ttl is still a call — the store, not the ledger, is its cache.
    expect(await spendDescription('n-7')).toEqual({
      kind: 'budget-exhausted',
      spent: 2,
      budget: 2,
    });
    expect(descriptions.fetched).toEqual(['n-7']);
  });

  it('[GOV-9] records a failed description with its outcome', async () => {
    const limited = failure('rate-limited', 429, 'over quota');
    const descriptions = scriptedDescriptions('sam.gov', [limited]);
    const log = new InMemorySourceCallLog();
    const gate = new RequestGate(log, policyOf({ ttlMs: 0 }), () => new Date(0));
    expect(
      await gate.spend(
        {
          source: 'sam.gov',
          operation: 'description',
          query: { noticeId: 'n-1' },
          cacheable: false,
        },
        () => descriptions.get('n-1'),
      ),
    ).toEqual(limited);
    expect(log.calls[0]).toMatchObject({
      operation: 'description',
      outcome: 'rate-limited',
      status: 429,
      error: 'over quota',
    });
  });
});
