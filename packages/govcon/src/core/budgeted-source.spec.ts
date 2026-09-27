import { BUDGET_WINDOW_MS, BudgetedSource } from './budgeted-source';
import type { SourceResult } from './ports';
import type { OpportunityQuery } from './query';
import { fetched, InMemorySourceCallLog, okResult, scriptedSource } from './testing';

const query: OpportunityQuery = {
  postedFrom: '2026-09-20',
  postedTo: '2026-09-26',
  limit: 1000,
  offset: 0,
  naics: '332710',
};
const HOUR = 60 * 60 * 1000;

function harness(replies: readonly SourceResult[], policy = { ttlMs: 24 * HOUR, dailyBudget: 3 }) {
  const inner = scriptedSource('sam.gov', replies);
  const log = new InMemorySourceCallLog();
  let nowMs = Date.parse('2026-09-26T12:00:00Z');
  const warnings: string[] = [];
  const source = new BudgetedSource(
    inner,
    log,
    policy,
    () => new Date(nowMs),
    (m) => warnings.push(m),
  );
  return { inner, log, source, warnings, advance: (ms: number) => (nowMs += ms) };
}

describe('the budgeted source', () => {
  it('[GOV-2] answers a query pulled inside the cache window from the log, calling nothing', async () => {
    const page = okResult([fetched({ noticeId: 'a' }), fetched({ noticeId: 'b' })]);
    const { inner, log, source, advance } = harness([page]);

    expect(await source.search(query)).toEqual(page);
    expect(inner.queries).toHaveLength(1);
    expect(log.calls).toHaveLength(1);
    expect(log.calls[0]).toMatchObject({
      outcome: 'ok',
      status: 200,
      totalRecords: 2,
      recordCount: 2,
    });

    advance(HOUR);
    const again = await source.search(query);
    expect(again.kind).toBe('cached');
    expect(again).toMatchObject({ recordCount: 2, requestedAt: '2026-09-26T12:00:00.000Z' });
    expect(inner.queries).toHaveLength(1);
    expect(log.calls).toHaveLength(1);

    // A different page is a different query.
    await source.search({ ...query, offset: 1000 });
    expect(inner.queries).toHaveLength(2);
  });

  it('[GOV-2] calls again once the window has passed, and never caches when the ttl is zero', async () => {
    const { inner, source, advance } = harness([okResult([])]);
    await source.search(query);
    advance(24 * HOUR + 1);
    expect((await source.search(query)).kind).toBe('ok');
    expect(inner.queries).toHaveLength(2);

    const uncached = harness([okResult([])], { ttlMs: 0, dailyBudget: 10 });
    await uncached.source.search(query);
    await uncached.source.search(query);
    expect(uncached.inner.queries).toHaveLength(2);
  });

  it('[GOV-3] stops at the budget over a rolling day — errors and rate limits count as attempts', async () => {
    const rateLimited: SourceResult = {
      kind: 'error',
      outcome: 'rate-limited',
      status: 429,
      message: 'over quota',
    };
    const { inner, log, source, advance } = harness(
      [okResult([]), rateLimited, okResult([]), okResult([])],
      { ttlMs: 0, dailyBudget: 3 },
    );
    await source.search(query);
    expect(await source.search(query)).toEqual(rateLimited);
    await source.search(query);
    expect(inner.queries).toHaveLength(3);
    expect(log.calls.map((call) => call.outcome)).toEqual(['ok', 'rate-limited', 'ok']);
    expect(log.calls[1]).toMatchObject({ status: 429, error: 'over quota', totalRecords: null });

    const refused = await source.search(query);
    expect(refused).toEqual({ kind: 'budget-exhausted', spent: 3, budget: 3 });
    expect(inner.queries).toHaveLength(3);

    advance(BUDGET_WINDOW_MS + 1);
    expect((await source.search(query)).kind).toBe('ok');
    expect(inner.queries).toHaveLength(4);
  });

  it('[GOV-2] treats a log that cannot answer as empty: the source is called and the failure is a warning', async () => {
    const { inner, log, source, warnings } = harness([okResult([fetched({ noticeId: 'a' })])]);
    log.failing = new Error('connection refused');

    const result = await source.search(query);
    expect(result.kind).toBe('ok');
    expect(inner.queries).toHaveLength(1);
    expect(warnings).toEqual([
      'call log fresh call not read: connection refused',
      'call log call count not read: connection refused',
      'call log not written: connection refused',
    ]);
  });

  it('carries the inner source identity and availability', () => {
    const { source } = harness([]);
    expect(source.id).toBe('sam.gov');
    expect(source.availability).toEqual({ enabled: true, reason: null });
  });
});
