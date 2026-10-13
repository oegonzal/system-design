import { horizonRowOf, type AwardFamily, type HorizonCursor } from '@sysdesign/contracts';

import type { Gated } from '../budget';
import type { EndingAwardsPage } from '../ports';
import { failure } from '../testing';
import {
  bucketHorizon,
  horizonEnd,
  monthsAhead,
  soonestRows,
  walkHorizon,
  type HorizonWalkDeps,
} from './horizon';

const TODAY = '2026-06-15';
const row = (endsAt: string, family: AwardFamily = 'contracts', amount = 100) =>
  horizonRowOf({ externalId: `${family}-${endsAt}`, endsAt, family, amount });
const page = (
  rows: EndingAwardsPage['rows'],
  next: HorizonCursor | null = null,
  rejected = 0,
): Gated<EndingAwardsPage> => ({ kind: 'ok', value: { rows, rejected, next } });
const cursor = (id: number): HorizonCursor => ({ id, sortValue: String(id) });

/** Pages per family, answered in order; every ask remembered. */
function scripted(
  pages: Partial<Record<AwardFamily, Gated<EndingAwardsPage>[]>>,
  overrides: Partial<HorizonWalkDeps> = {},
) {
  const asks: [AwardFamily, HorizonCursor | null, number][] = [];
  const served: Record<AwardFamily, number> = { contracts: 0, idvs: 0 };
  const deps: HorizonWalkDeps = {
    families: ['contracts', 'idvs'],
    maxPages: 5,
    deadlineMs: 60_000,
    now: () => new Date('2026-06-15T12:00:00Z'),
    async page(family, after, index) {
      asks.push([family, after, index]);
      const reply = pages[family]?.[served[family]] ?? page([]);
      served[family] += 1;
      return reply;
    },
    ...overrides,
  };
  return { deps, asks };
}

describe('the horizon', () => {
  it('[GOV-21] names the months ahead and the last day of the window, across a year end', () => {
    expect(monthsAhead(TODAY, 3)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
    expect(monthsAhead('2026-11-10', 3)).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
    expect(horizonEnd(TODAY, 3)).toBe('2026-08-31');
    expect(horizonEnd('2026-01-15', 2)).toBe('2026-02-28');
  });

  it('[GOV-21] buckets ending awards by calendar month across the window per family, over every fetched row, keeping at most the limit soonest-ending', () => {
    const rows = [
      row('2026-06-20'),
      row('2026-06-25', 'idvs', 0),
      row('2026-08-02'),
      row('2026-08-02', 'contracts', 50),
      row('2026-06-10'),
      row('2026-09-01'),
    ];
    const buckets = bucketHorizon(rows, TODAY, 3);
    expect(buckets.map((bucket) => [bucket.month, bucket.contracts, bucket.idvs])).toEqual([
      [6, { count: 1, amount: 100 }, { count: 1, amount: 0 }],
      [7, { count: 0, amount: 0 }, { count: 0, amount: 0 }],
      [8, { count: 2, amount: 150 }, { count: 0, amount: 0 }],
    ]);
    expect(soonestRows(rows, 3).map((soonest) => soonest.externalId)).toEqual([
      'contracts-2026-06-10',
      'contracts-2026-06-20',
      'idvs-2026-06-25',
    ]);
  });

  it('[GOV-20] [GOV-21] walks each family newest-ending first, skips what ends past the window, stops when the end date passes today, and reports capped by pages or by the deadline with the earliest end date reached', async () => {
    const { deps, asks } = scripted({
      contracts: [
        page([row('2030-01-01'), row('2026-08-01'), row('2026-07-01')], cursor(1)),
        page([row('2026-06-20'), row('2026-06-10'), row('2026-05-01')], cursor(2)),
      ],
      idvs: [page([row('2026-09-01', 'idvs')])],
    });
    const walk = await walkHorizon(deps, TODAY, 12);
    expect(walk.rows.map((kept) => kept.externalId)).toEqual([
      'contracts-2026-08-01',
      'contracts-2026-07-01',
      'contracts-2026-06-20',
      'idvs-2026-09-01',
    ]);
    expect(walk).toMatchObject({
      capped: false,
      stoppedBy: null,
      reachedEndsAt: null,
      failure: null,
    });
    expect(asks).toEqual([
      ['contracts', null, 0],
      ['contracts', cursor(1), 1],
      ['idvs', null, 0],
    ]);

    const byPages = scripted(
      {
        contracts: [page([row('2026-08-01'), row('2026-07-01')], cursor(1))],
        idvs: [page([row('2026-09-01', 'idvs')])],
      },
      { maxPages: 1 },
    );
    const capped = await walkHorizon(byPages.deps, TODAY, 12);
    expect(capped).toMatchObject({ capped: true, stoppedBy: 'pages', reachedEndsAt: '2026-07-01' });
    expect(capped.rows).toHaveLength(3);
    expect(byPages.asks.map(([family]) => family)).toEqual(['contracts', 'idvs']);

    const beforeWindow = scripted(
      { contracts: [page([row('2031-01-01')], cursor(1))] },
      { maxPages: 1, families: ['contracts'] },
    );
    expect(await walkHorizon(beforeWindow.deps, TODAY, 12)).toMatchObject({
      capped: true,
      stoppedBy: 'pages',
      reachedEndsAt: horizonEnd(TODAY, 12),
      rows: [],
    });

    let tick = Date.parse('2026-06-15T12:00:00Z');
    const byDeadline = scripted(
      { contracts: [page([row('2026-08-01')], cursor(1)), page([row('2026-07-01')], cursor(2))] },
      { deadlineMs: 1_000, now: () => new Date((tick += 600)) },
    );
    const late = await walkHorizon(byDeadline.deps, TODAY, 12);
    expect(late).toMatchObject({
      capped: true,
      stoppedBy: 'deadline',
      reachedEndsAt: '2026-08-01',
    });
    expect(byDeadline.asks).toHaveLength(1);
  });

  it('[GOV-20] a rate limit or a spent budget ends the walk with that failure, keeping what came before, and nothing is retried', async () => {
    const { deps, asks } = scripted({
      contracts: [
        page([row('2026-08-01')], cursor(1)),
        failure('rate-limited', 429, 'rate limited'),
      ],
    });
    const walk = await walkHorizon(deps, TODAY, 12);
    expect(walk).toMatchObject({
      capped: true,
      stoppedBy: 'source',
      reachedEndsAt: '2026-08-01',
      failure: { outcome: 'rate-limited' },
    });
    expect(walk.rows).toHaveLength(1);
    expect(asks).toHaveLength(2);

    const spent = scripted({
      contracts: [{ kind: 'budget-exhausted', spent: 3, budget: 3 }],
    });
    expect(await walkHorizon(spent.deps, TODAY, 12)).toMatchObject({
      rows: [],
      failure: { kind: 'budget-exhausted' },
    });
  });
});
