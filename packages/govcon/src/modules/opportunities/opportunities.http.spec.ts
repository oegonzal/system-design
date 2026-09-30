import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  DescriptionFetch,
  NoticeDto,
  LeadsReport,
  PullReport,
  SearchProfile,
  SourceCall,
  SourceStatus,
} from '@sysdesign/contracts';
import { ensureDatabase, GovconOpportunity, GovconSourceCall } from '@sysdesign/db';

import type { BudgetPolicy } from '../../core/budget';
import {
  okPage,
  opportunityOf,
  scriptedDescriptions,
  scriptedSearch,
  tinyProfile,
} from '../../core/testing';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import {
  BUDGET_POLICY,
  CLOCK,
  NOTICE_DESCRIPTIONS,
  OPPORTUNITY_SEARCH,
  SEARCH_PROFILES,
} from './tokens';

type Envelope<T> = { data: T };
type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

const NOW = new Date('2026-09-26T12:00:00Z');
/** The two slices of the tiny profile: three notices, one of them a set-aside the profile cannot bid. */
const PAGES = [
  okPage([opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b', setAsideCode: '8A' })]),
  okPage([opportunityOf({ noticeId: 'c', naicsCode: '541511', naicsCodes: ['541511'] })]),
];

/**
 * The real module over real HTTP and the real Postgres ledger; only the
 * upstream adapters are scripted (behind the real gate, so the ledger and
 * the budget are exercised for real), the clock is fixed and the registry is
 * the tiny profile with two slices.
 */
async function boot(): Promise<{
  app: INestApplication;
  url: string;
  scripted: ReturnType<typeof scriptedSearch>;
}> {
  const scripted = scriptedSearch('sam.gov', [
    okPage([
      opportunityOf({ noticeId: 'a' }),
      opportunityOf({ noticeId: 'b', setAsideCode: '8A' }),
    ]),
    okPage([opportunityOf({ noticeId: 'c', naicsCode: '541511', naicsCodes: ['541511'] })]),
  ]);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(() => NOW)
    .overrideProvider(BUDGET_POLICY)
    .useValue({
      ttlMs: 0,
      pullDeadlineMs: 120_000,
      buckets: { 'sam.gov': { dailyBudget: 4 } },
    } satisfies BudgetPolicy)
    .overrideProvider(SEARCH_PROFILES)
    .useValue(new Map([['tiny', tinyProfile()]]))
    .overrideProvider(OPPORTUNITY_SEARCH)
    .useValue(scripted)
    .overrideProvider(NOTICE_DESCRIPTIONS)
    .useValue(scriptedDescriptions('sam.gov'))
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, url: await app.getUrl(), scripted };
}

const truncate = async (em: EntityManager) => {
  await em.fork().nativeDelete(GovconSourceCall, {});
  await em.fork().nativeDelete(GovconOpportunity, {});
};

const post = (url: string, path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the govcon HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;
  let scripted: ReturnType<typeof scriptedSearch>;

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url, scripted } = await boot());
    em = app.get(EntityManager);
  });

  /** Every test seeds what it reads: an empty store, an empty ledger, the scripted pages from the top. */
  beforeEach(async () => {
    await truncate(em);
    scripted.script(PAGES);
  });

  /** Two searches, three notices stored. */
  const pulled = () => post(url, '/pulls', { profile: 'tiny', days: 2 });

  afterAll(async () => {
    await truncate(em);
    await app.close();
  });

  it('[GOV-8] answers health, the profile registry and the source status from their contracts', async () => {
    expect((await (await fetch(`${url}/health`)).json()) as unknown).toEqual({ status: 'ok' });

    const profiles = (await (await fetch(`${url}/profiles`)).json()) as Envelope<SearchProfile[]>;
    expect(profiles.data.map((profile) => profile.id)).toEqual(['tiny']);
    expect(profiles.data[0]?.scoring.weights).toEqual(tinyProfile().scoring.weights);

    const source = (await (await fetch(`${url}/source`)).json()) as Envelope<SourceStatus>;
    expect(source.data).toEqual({
      id: 'sam.gov',
      availability: { enabled: true, reason: null },
      budget: { spent: 0, limit: 4, windowHours: 24 },
      cacheTtlHours: 0,
    });
  });

  it('[GOV-8] refuses a bad pull body with named issues, and a window the plan cannot run', async () => {
    const bad = await post(url, '/pulls', { profile: 'tiny', days: 0, extra: 1 });
    expect(bad.status).toBe(400);
    const issues = ((await bad.json()) as { issues: { path: string }[] }).issues.map((i) => i.path);
    expect(issues).toEqual(expect.arrayContaining(['days']));

    const both = await post(url, '/pulls', {
      profile: 'tiny',
      days: 2,
      from: '2026-09-01',
      to: '2026-09-02',
    });
    expect(both.status).toBe(400);
    expect(((await both.json()) as { message: string }).message).toMatch(/alternatives/);
    const backwards = await post(url, '/pulls', {
      profile: 'tiny',
      from: '2026-09-30',
      to: '2026-09-26',
    });
    expect(backwards.status).toBe(400);
    expect(((await backwards.json()) as { message: string }).message).toMatch(
      /starts after it ends/,
    );

    expect((await post(url, '/pulls', { profile: 'nope', days: 1 })).status).toBe(404);
  });

  it('[GOV-8] pulls synchronously and answers the report; the ledger counts every attempt', async () => {
    const response = await post(url, '/pulls', { profile: 'tiny', days: 2 });
    expect(response.status).toBe(200);
    const { data: report } = (await response.json()) as Envelope<PullReport>;
    expect(report.window).toEqual({ from: '2026-09-24', to: '2026-09-26' });
    expect(report.slices.map((slice) => [slice.outcome, slice.inserted, slice.rejected])).toEqual([
      ['ok', 2, 0],
      ['ok', 1, 0],
    ]);
    expect(report).toMatchObject({ profile: 'tiny', spent: 2, budget: 4, stoppedBy: null });

    const source = (await (await fetch(`${url}/source`)).json()) as Envelope<SourceStatus>;
    expect(source.data.budget.spent).toBe(2);
  });

  it('[GOV-8] [GOV-15] ranks the store over the query filters, coerced and bounded at the edge', async () => {
    await pulled();
    const all = (await (await fetch(`${url}/leads?profile=tiny`)).json()) as Envelope<LeadsReport>;
    // `b` is an 8(a) set-aside the profile cannot bid: filtered in SQL, never scored.
    expect(all.data).toMatchObject({
      profile: 'tiny',
      candidates: 2,
      capped: false,
      excluded: 0,
      matching: 2,
      limit: 25,
      offset: 0,
    });
    expect(all.data.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['a', 'c']);

    const page2 = (await (
      await fetch(`${url}/leads?profile=tiny&limit=1&offset=1`)
    ).json()) as Envelope<LeadsReport>;
    expect(page2.data.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['c']);
    const software = (await (
      await fetch(`${url}/leads?profile=tiny&naics=5415&deadlineWithinDays=30`)
    ).json()) as Envelope<LeadsReport>;
    expect(software.data.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['c']);
    expect((await fetch(`${url}/leads?profile=tiny&naics=x`)).status).toBe(400);

    const one = (await (
      await fetch(`${url}/leads?profile=tiny&tier=high&limit=1`)
    ).json()) as Envelope<LeadsReport>;
    expect(one.data.leads).toHaveLength(1);
    expect(one.data.leads[0]?.tier).toBe('high');

    const strict = (await (
      await fetch(`${url}/leads?profile=tiny&minScore=99`)
    ).json()) as Envelope<LeadsReport>;
    expect(strict.data.matching).toBe(0);

    const bad = await fetch(`${url}/leads?profile=tiny&limit=0`);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { issues: { path: string }[] }).issues[0]?.path).toBe('limit');
    expect((await fetch(`${url}/leads?profile=tiny&tier=huge`)).status).toBe(400);
    // The default profile is not in this registry: unknown, not silently empty.
    expect((await fetch(`${url}/leads`)).status).toBe(404);
  });

  it('[GOV-8] [GOV-9] shows a stored notice, fetches its description once, and reports a spent budget as an outcome', async () => {
    await pulled();
    const detail = (await (
      await fetch(`${url}/notices/a?profile=tiny`)
    ).json()) as Envelope<NoticeDto>;
    expect(detail.data.opportunity.noticeId).toBe('a');
    expect(detail.data.factors).toHaveLength(6);
    expect(detail.data.description).toBeNull();
    expect((await fetch(`${url}/notices/nope?profile=tiny`)).status).toBe(404);
    expect((await post(url, '/notices/nope/description', {})).status).toBe(404);

    const first = await post(url, '/notices/a/description', {});
    expect(first.status).toBe(200);
    expect(((await first.json()) as Envelope<DescriptionFetch>).data).toEqual({
      status: 'ok',
      description: { text: 'Description of a', fetchedAt: NOW.toISOString() },
    });
    const again = (
      (await (await post(url, '/notices/a/description', {})).json()) as Envelope<DescriptionFetch>
    ).data;
    expect(again.status).toBe('ok');

    const shown = (await (
      await fetch(`${url}/notices/a?profile=tiny`)
    ).json()) as Envelope<NoticeDto>;
    expect(shown.data.description?.text).toBe('Description of a');

    // 2 searches + 1 description = 3 of 4; the next description spends the last, the one after is refused.
    expect(
      ((await (await post(url, '/notices/c/description', {})).json()) as Envelope<DescriptionFetch>)
        .data.status,
    ).toBe('ok');
    const refused = (
      (await (await post(url, '/notices/b/description', {})).json()) as Envelope<DescriptionFetch>
    ).data;
    expect(refused).toEqual({ status: 'budget-exhausted', spent: 4, budget: 4 });

    // Every row carries the fixed clock, so the order among them is not meaningful — the counts are.
    const page = (await (await fetch(`${url}/source/calls?limit=3`)).json()) as Page<SourceCall>;
    expect(page.meta).toEqual({ total: 4, limit: 3, offset: 0 });
    expect(page.data).toHaveLength(3);
    const calls = (await (await fetch(`${url}/source/calls?limit=10`)).json()) as Page<SourceCall>;
    expect(calls.data.map((call) => call.operation).sort()).toEqual([
      'description',
      'description',
      'search',
      'search',
    ]);
    expect(
      calls.data
        .filter((call) => call.operation === 'description')
        .map((call) => (call.query as { noticeId: string }).noticeId)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(
      calls.data.every((call) => call.outcome === 'ok' && call.requestedAt === NOW.toISOString()),
    ).toBe(true);
    expect((await fetch(`${url}/source/calls?limit=0`)).status).toBe(400);
  });
});
