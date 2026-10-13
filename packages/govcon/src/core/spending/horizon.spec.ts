import { horizonRowOf, type AwardFamily } from '@sysdesign/contracts';

import type { EndingAwardsPage } from '../ports';
import { failure } from '../testing';
import {
  bucketHorizon,
  horizonEnd,
  monthsAhead,
  soonestRows,
  walkHorizon,
  type HorizonPageAnswer,
  type HorizonWalkDeps,
} from './horizon';

const TODAY = '2026-06-15';
const row = (endsAt: string, family: AwardFamily = 'contracts', amount = 100) =>
  horizonRowOf({ externalId: `${family}-${endsAt}`, endsAt, family, amount });
/** A page of contracts ending on these dates, newest first as the source lists them. */
const page = (dates: readonly string[], hasMore = true): EndingAwardsPage => ({
  rows: dates.map((endsAt) => row(endsAt)),
  rejected: 0,
  hasMore,
});
const NO_PAGE: EndingAwardsPage = { rows: [], rejected: 0, hasMore: false };

/**
 * Eight pages of contracts, newest-ending first. Today (2026-06-15) falls on
 * page 5; a twelve-month window ends 2027-05-31, inside page 2.
 */
const CONTRACTS: readonly EndingAwardsPage[] = [
  page(['2031-01-01', '2029-01-01']),
  page(['2028-06-01', '2027-08-01']),
  page(['2027-07-01', '2027-03-01']),
  page(['2027-01-15', '2026-11-01']),
  page(['2026-09-01', '2026-07-01']),
  page(['2026-06-20', '2026-06-01']),
  page(['2026-05-01', '2026-04-01']),
  page(['2026-03-01', '2026-02-01'], false),
];

type Book = Partial<Record<AwardFamily, readonly (EndingAwardsPage | HorizonPageAnswer)[]>>;

/** A source that answers each family's pages by index, an empty page past the end, and remembers every ask. */
function scripted(book: Book, overrides: Partial<HorizonWalkDeps> = {}) {
  const asks: [AwardFamily, number][] = [];
  const deps: HorizonWalkDeps = {
    families: ['contracts', 'idvs'],
    maxPages: 30,
    maxDepth: 500,
    deadlineMs: 60_000,
    now: () => new Date('2026-06-15T12:00:00Z'),
    async page(family, index) {
      asks.push([family, index]);
      const answer = book[family]?.[index] ?? NO_PAGE;
      return 'kind' in answer ? answer : { kind: 'ok', value: answer };
    },
    ...overrides,
  };
  return { deps, asks };
}

const endDates = (rows: readonly { endsAt: string }[]): string[] =>
  rows.map((kept) => kept.endsAt).sort();

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

  it('[GOV-20] [GOV-21] finds the page where the end dates cross today by doubling and halving, then reads forward from the soonest-ending award until a page begins past the window, fetching no page twice', async () => {
    const { deps, asks } = scripted({
      contracts: CONTRACTS,
      idvs: [{ rows: [row('2026-08-01', 'idvs')], rejected: 0, hasMore: false }],
    });
    const walk = await walkHorizon(deps, TODAY, 12);
    // Doubling: pages 0, 1, 3, 7; halving: 5, 4; reading forward from 5: 4 and 3 are known, 2 is new and begins past the window.
    expect(asks.filter(([family]) => family === 'contracts').map(([, index]) => index)).toEqual([
      0, 1, 3, 7, 5, 4, 2,
    ]);
    expect(asks.filter(([family]) => family === 'idvs')).toEqual([['idvs', 0]]);
    expect(endDates(walk.rows)).toEqual([
      '2026-06-20',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-11-01',
      '2027-01-15',
      '2027-03-01',
    ]);
    expect(walk).toMatchObject({
      capped: false,
      stoppedBy: null,
      completeBefore: null,
      failure: null,
    });

    // Today on the first page, and nothing at all: one page each.
    const shallow = scripted({ contracts: [page(['2026-07-01', '2026-06-01'])] });
    const near = await walkHorizon(shallow.deps, TODAY, 12);
    expect(endDates(near.rows)).toEqual(['2026-07-01']);
    expect(shallow.asks).toEqual([
      ['contracts', 0],
      ['idvs', 0],
    ]);
    expect((await walkHorizon(scripted({}).deps, TODAY, 12)).rows).toEqual([]);
  });

  it('[GOV-21] keeps an award once when it shows on two pages, and reads every page when the list ends before it reaches today', async () => {
    const { deps, asks } = scripted(
      {
        contracts: [page(['2027-02-01', '2026-12-01']), page(['2026-12-01', '2026-08-01'], false)],
      },
      { families: ['contracts'] },
    );
    const walk = await walkHorizon(deps, TODAY, 12);
    expect(endDates(walk.rows)).toEqual(['2026-08-01', '2026-12-01', '2027-02-01']);
    expect(walk.capped).toBe(false);
    expect(asks.map(([, index]) => index)).toEqual([0, 1]);
  });

  it('[GOV-20] [GOV-21] capped by the page bound while reading forward, the nearest part of the window is complete and said so; capped while still seeking today, or at the source’s depth, nothing is — and the next family still walks', async () => {
    const reading = scripted(
      {
        contracts: CONTRACTS,
        idvs: [{ rows: [row('2026-08-01', 'idvs')], rejected: 0, hasMore: false }],
      },
      { maxPages: 6 },
    );
    const partial = await walkHorizon(reading.deps, TODAY, 12);
    // Six pages found today's place (0, 1, 3, 7, 5, 4); pages 5, 4 and 3 were read, page 2 was not.
    expect(endDates(partial.rows.filter((kept) => kept.family === 'contracts'))).toEqual([
      '2026-06-20',
      '2026-07-01',
      '2026-09-01',
      '2026-11-01',
      '2027-01-15',
    ]);
    expect(partial).toMatchObject({
      capped: true,
      stoppedBy: 'pages',
      completeBefore: '2027-01-15',
    });
    // The other family has its own page bound: it walked, and all of it is here.
    expect(reading.asks.filter(([family]) => family === 'idvs')).toHaveLength(1);
    expect(endDates(partial.rows.filter((kept) => kept.family === 'idvs'))).toEqual(['2026-08-01']);

    const seeking = scripted({ contracts: CONTRACTS }, { maxPages: 5, families: ['contracts'] });
    expect(await walkHorizon(seeking.deps, TODAY, 12)).toMatchObject({
      capped: true,
      stoppedBy: 'pages',
      completeBefore: null,
      rows: [],
    });
    expect(seeking.asks).toHaveLength(5);

    const deep = scripted({ contracts: CONTRACTS }, { maxDepth: 4, families: ['contracts'] });
    expect(await walkHorizon(deep.deps, TODAY, 12)).toMatchObject({
      capped: true,
      stoppedBy: 'pages',
      completeBefore: null,
      rows: [],
    });
    expect(deep.asks.map(([, index]) => index)).toEqual([0, 1, 3]);
  });

  it('[GOV-20] [GOV-21] the wall-clock deadline ends the whole walk, families not begun included', async () => {
    let tick = Date.parse('2026-06-15T12:00:00Z');
    const { deps, asks } = scripted(
      { contracts: CONTRACTS },
      { deadlineMs: 1_000, now: () => new Date((tick += 600)) },
    );
    expect(await walkHorizon(deps, TODAY, 12)).toMatchObject({
      capped: true,
      stoppedBy: 'deadline',
      completeBefore: null,
      rows: [],
    });
    expect(asks).toEqual([['contracts', 0]]);
  });

  it('[GOV-20] a rate limit or a spent budget ends the walk with that failure, keeping what was read before it, and nothing is retried', async () => {
    const refusing = [...CONTRACTS.slice(0, 2), failure('rate-limited', 429, 'rate limited')];
    const { deps, asks } = scripted(
      { contracts: [...refusing, ...CONTRACTS.slice(3)] },
      { families: ['contracts'] },
    );
    const walk = await walkHorizon(deps, TODAY, 12);
    // Pages 5, 4 and 3 were read before page 2 refused.
    expect(walk).toMatchObject({
      capped: true,
      stoppedBy: 'source',
      completeBefore: '2027-01-15',
      failure: { outcome: 'rate-limited' },
    });
    expect(walk.rows).toHaveLength(5);
    expect(asks.map(([, index]) => index)).toEqual([0, 1, 3, 7, 5, 4, 2]);

    const both = scripted({ contracts: [...refusing, ...CONTRACTS.slice(3)] });
    const halted = await walkHorizon(both.deps, TODAY, 12);
    // The other family never began, so no part of the window is complete.
    expect(halted).toMatchObject({ stoppedBy: 'source', completeBefore: null });
    expect(both.asks.some(([family]) => family === 'idvs')).toBe(false);

    const spent = scripted({ contracts: [{ kind: 'budget-exhausted', spent: 3, budget: 3 }] });
    expect(await walkHorizon(spent.deps, TODAY, 12)).toMatchObject({
      rows: [],
      stoppedBy: 'source',
      failure: { kind: 'budget-exhausted' },
    });
  });
});
