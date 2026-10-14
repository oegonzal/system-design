import type { OpportunityQuery } from '@sysdesign/contracts';

import type { Gated } from './budget';
import type { SearchPage } from './ports';
import { runPull, type PlannedSlice, type PullDeps, type PullOutcome } from './pull';
import { InMemoryOpportunityRepository, opportunityOf } from './testing';

const query = (naics: string, offset = 0): OpportunityQuery => ({
  postedFrom: '2026-09-20',
  postedTo: '2026-09-26',
  limit: 2,
  offset,
  naics,
});
const slice = (naics: string, name: string | null = null): PlannedSlice => ({
  searchId: name === null ? null : `s-${name}`,
  name,
  query: query(naics),
});
const page = (ids: string[], totalRecords = ids.length): Gated<SearchPage> => ({
  kind: 'ok',
  value: {
    opportunities: ids.map((noticeId) => opportunityOf({ noticeId })),
    rejected: [],
    totalRecords,
  },
});

/** A gate that answers the scripted results in order and a clock that ticks per call. */
function harness(replies: readonly Gated<SearchPage>[], overrides: Partial<PullDeps> = {}) {
  const repository = new InMemoryOpportunityRepository();
  const queries: OpportunityQuery[] = [];
  const warnings: string[] = [];
  let nowMs = Date.parse('2026-09-26T12:00:00Z');
  let call = 0;
  const deps: PullDeps = {
    maxPagesPerSlice: 1,
    deadlineMs: 120_000,
    now: () => new Date(nowMs),
    search: async (q) => {
      queries.push(q);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new Error('no reply');
      return reply;
    },
    store: (opportunities, seenAt) => repository.upsertMany(opportunities, seenAt),
    warn: (m) => warnings.push(m),
    ...overrides,
  };
  return { deps, repository, queries, warnings, tick: (ms: number) => (nowMs += ms) };
}

/** The reports of a pull's runs, in the plan's order. */
const reportsOf = ({ runs }: Pick<PullOutcome, 'runs'>) => runs.map((run) => run.report);

describe('runPull', () => {
  it('runs every slice in order under its name, stores what came in, and reports per slice', async () => {
    const { deps, repository, queries } = harness([page(['a', 'b'], 2), page(['b'])]);
    const { runs, stoppedBy } = await runPull([slice('11', 'first'), slice('22')], deps);
    expect(queries.map((q) => q.naics)).toEqual(['11', '22']);
    expect(
      reportsOf({ runs }).map((s) => [s.name, s.outcome, s.received, s.inserted, s.updated]),
    ).toEqual([
      ['first', 'ok', 2, 2, 0],
      [null, 'ok', 1, 0, 1],
    ]);
    expect(stoppedBy).toBeNull();
    expect(repository.rows.size).toBe(2);
    // Each run keeps the slice it ran and the notices its pages carried — one a second slice saw again included.
    expect(runs.map((run) => [run.slice.searchId, run.noticeIds])).toEqual([
      ['s-first', ['a', 'b']],
      [null, ['b']],
    ]);
  });

  it('[GOV-19] stops starting slices at the deadline and says which it skipped', async () => {
    const { deps, queries, tick } = harness([page(['a'])], {
      deadlineMs: 5_000,
      search: async (q) => {
        queries.push(q);
        tick(3_000);
        return page([`n-${q.naics}`]);
      },
    });
    const { runs, stoppedBy } = await runPull([slice('11'), slice('22'), slice('33')], deps);
    expect(queries.map((q) => q.naics)).toEqual(['11', '22']);
    expect(reportsOf({ runs }).map((s) => [s.outcome, s.detail])).toEqual([
      ['ok', null],
      ['ok', null],
      ['skipped', 'stopped earlier: deadline'],
    ]);
    expect(stoppedBy).toBe('deadline');
  });

  it('[GOV-3] stops at the budget: the slice that hit it says so, the rest are skipped', async () => {
    const { deps, queries } = harness([
      page(['a']),
      { kind: 'budget-exhausted', spent: 1, budget: 1 },
    ]);
    const { runs, stoppedBy } = await runPull([slice('11'), slice('22'), slice('33')], deps);
    expect(reportsOf({ runs }).map((s) => [s.outcome, s.detail])).toEqual([
      ['ok', null],
      ['budget-exhausted', 'budget 1/1 spent'],
      ['skipped', 'stopped earlier: budget'],
    ]);
    expect(stoppedBy).toBe('budget');
    expect(queries).toHaveLength(2);
  });

  it('[GOV-3] a rate limit ends the pull; any other error fails its slice alone', async () => {
    const limited = await runPull(
      [slice('11'), slice('22')],
      harness([{ kind: 'error', outcome: 'rate-limited', status: 429, message: 'over quota' }])
        .deps,
    );
    expect(reportsOf(limited).map((s) => s.outcome)).toEqual(['error', 'skipped']);
    expect(reportsOf(limited)[0]?.detail).toBe('rate-limited: over quota');
    expect(limited.stoppedBy).toBe('rate-limited');

    const { deps, warnings } = harness([
      { kind: 'error', outcome: 'error', status: 500, message: 'status 500' },
      page(['b']),
    ]);
    const failed = await runPull([slice('11'), slice('22')], deps);
    expect(reportsOf(failed).map((s) => [s.outcome, s.truncated])).toEqual([
      ['error', false],
      ['ok', false],
    ]);
    expect(failed.stoppedBy).toBeNull();
    expect(warnings).toEqual(['slice naics=11 failed — error: status 500']);
  });

  it('pages up to maxPagesPerSlice, reports what remains as truncated, and marks a failed later page error and truncated', async () => {
    const paged = harness([page(['a', 'b'], 5), page(['c', 'd'], 5)], { maxPagesPerSlice: 2 });
    const { runs } = await runPull([slice('11')], paged.deps);
    expect(paged.queries.map((q) => q.offset)).toEqual([0, 2]);
    expect(reportsOf({ runs })[0]).toMatchObject({
      outcome: 'ok',
      pages: 2,
      received: 4,
      inserted: 4,
      truncated: true,
      detail: '1 more record(s) beyond maxPagesPerSlice',
    });

    const done = harness([page(['a', 'b'], 3), page(['c'], 3)], { maxPagesPerSlice: 5 });
    const complete = await runPull([slice('11')], done.deps);
    expect(done.queries).toHaveLength(2);
    expect(reportsOf(complete)[0]).toMatchObject({ pages: 2, received: 3, truncated: false });

    const broken = harness(
      [
        page(['a', 'b'], 5),
        { kind: 'error', outcome: 'invalid-response', status: 200, message: 'body is not JSON' },
      ],
      { maxPagesPerSlice: 3 },
    );
    const partial = await runPull([slice('11')], broken.deps);
    expect(reportsOf(partial)[0]).toMatchObject({
      outcome: 'error',
      pages: 1,
      inserted: 2,
      truncated: true,
    });
    expect(partial.stoppedBy).toBeNull();
  });

  it('[GOV-2] reports a slice answered from the cache and stores nothing', async () => {
    const { deps, repository } = harness([
      { kind: 'cached', requestedAt: '2026-09-26T11:00:00.000Z', recordCount: 3 },
    ]);
    const { runs } = await runPull([slice('11')], deps);
    expect(reportsOf({ runs })[0]).toMatchObject({
      outcome: 'cached',
      detail: 'pulled 2026-09-26T11:00:00.000Z, 3 record(s)',
    });
    expect(repository.rows.size).toBe(0);
    expect(runs[0]?.noticeIds).toEqual([]);
  });
});
