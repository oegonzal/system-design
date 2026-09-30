import { RequestGate, type BudgetPolicy } from '../../core/budget';
import {
  InMemorySourceCallLog,
  okPage,
  okText,
  opportunityOf,
  scriptedDescriptions,
  scriptedSearch,
  scriptedSpendingAwards,
} from '../../core/testing';
import { SourceService } from './source.service';

const NOW = new Date('2026-09-26T12:00:00Z');

describe('the source service', () => {
  it('[GOV-11] reports every source with its bucket, every bucket as the ledger counts it, and lists the ledger newest first by operation', async () => {
    const search = scriptedSearch('sam.gov', [okPage([opportunityOf()])]);
    const spending = scriptedSpendingAwards([]);
    const descriptions = scriptedDescriptions('sam.gov', [okText('x')]);
    const log = new InMemorySourceCallLog();
    const policy: BudgetPolicy = {
      ttlMs: 6 * 60 * 60 * 1000,
      pullDeadlineMs: 1,
      buckets: { 'sam.gov': { dailyBudget: 4 } },
    };
    const gate = new RequestGate(log, policy, () => NOW);
    const service = new SourceService(search, spending, log, policy, gate);
    expect(await service.status()).toEqual({
      sources: [
        { id: 'sam.gov', availability: { enabled: true, reason: null }, bucket: 'sam.gov' },
        { id: 'usaspending', availability: { enabled: true, reason: null }, bucket: null },
      ],
      buckets: [{ id: 'sam.gov', spent: 0, limit: 4, windowHours: 24 }],
      cacheTtlHours: 6,
    });
    const query = { postedFrom: '2026-09-20', postedTo: '2026-09-26', limit: 10, offset: 0 };
    await gate.spend({ source: 'sam.gov', operation: 'search', query, cacheable: true }, () =>
      search.search(query),
    );
    await gate.spend(
      { source: 'sam.gov', operation: 'description', query: { noticeId: 'n-1' }, cacheable: false },
      () => descriptions.get('n-1'),
    );
    expect((await service.status()).buckets[0]?.spent).toBe(2);

    const [calls, total] = await service.calls({ operation: null, limit: 1, offset: 0 });
    expect(total).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ attempt: 1, outcome: 'ok', requestedAt: NOW.toISOString() });
    const [described, describedTotal] = await service.calls({
      operation: 'description',
      limit: 10,
      offset: 0,
    });
    expect(describedTotal).toBe(1);
    expect(described.map((call) => call.operation)).toEqual(['description']);
  });
});
