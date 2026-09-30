import { RequestGate, type BudgetPolicy } from '../../core/budget';
import { InMemorySourceCallLog, okPage, opportunityOf, scriptedSearch } from '../../core/testing';
import { SourceService } from './source.service';

const NOW = new Date('2026-09-26T12:00:00Z');

describe('the source service', () => {
  it('reports the source status with the budget as the ledger counts it, and lists the ledger newest first', async () => {
    const search = scriptedSearch('sam.gov', [okPage([opportunityOf()])]);
    const log = new InMemorySourceCallLog();
    const policy: BudgetPolicy = {
      ttlMs: 6 * 60 * 60 * 1000,
      pullDeadlineMs: 1,
      buckets: { 'sam.gov': { dailyBudget: 4 } },
    };
    const gate = new RequestGate(log, policy, () => NOW);
    const service = new SourceService(search, log, policy, gate);
    expect(await service.status()).toEqual({
      id: 'sam.gov',
      availability: { enabled: true, reason: null },
      budget: { spent: 0, limit: 4, windowHours: 24 },
      cacheTtlHours: 6,
    });
    const query = { postedFrom: '2026-09-20', postedTo: '2026-09-26', limit: 10, offset: 0 };
    await gate.spend({ source: 'sam.gov', operation: 'search', query, cacheable: true }, () =>
      search.search(query),
    );
    await gate.spend(
      { source: 'sam.gov', operation: 'search', query: { ...query, offset: 10 }, cacheable: true },
      () => search.search(query),
    );
    expect((await service.status()).budget.spent).toBe(2);

    const [calls, total] = await service.calls({ limit: 1, offset: 0 });
    expect(total).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      operation: 'search',
      attempt: 1,
      outcome: 'ok',
      requestedAt: NOW.toISOString(),
    });
    expect(log.calls).toHaveLength(2);
  });
});
