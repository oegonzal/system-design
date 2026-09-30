import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  Award,
  AwardsSummary,
  Bid,
  BidPipelineSummary,
  DescriptionFetch,
  FetchAwardsReport,
  LeadsReport,
  NoticeDto,
  PipelineRow,
  PullReport,
  SavedSearch,
  SourceCall,
  SourceStatus,
  StoredProfile,
} from '@sysdesign/contracts';
import {
  ensureDatabase,
  GovconAward,
  GovconBid,
  GovconOpportunity,
  GovconSavedSearch,
  GovconSearchProfile,
  GovconSourceCall,
} from '@sysdesign/db';

import type { BudgetPolicy } from '../../core/budget';
import {
  okPage,
  opportunityOf,
  scriptedDescriptions,
  pick,
  scriptedSearch,
  tinyProfile,
  awardDraftOf,
  awardPageOf,
  scriptedContractAwards,
  scriptedSpendingAwards,
} from '../../core/testing';
import {
  BUDGET_POLICY,
  CLOCK,
  CONTRACT_AWARDS,
  NOTICE_DESCRIPTIONS,
  OPPORTUNITY_SEARCH,
  SPENDING_AWARDS,
} from '../sources/tokens';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

type Envelope<T> = { data: T };
type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };
type Issues = { issues: { path: string; message: string }[] };

const NOW = new Date('2026-09-26T12:00:00Z');
/** The two saved searches of the tiny profile: three notices, one of them a set-aside the profile cannot bid. */
const PAGES = [
  okPage([opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b', setAsideCode: '8A' })]),
  okPage([opportunityOf({ noticeId: 'c', naicsCode: '541511', naicsCodes: ['541511'] })]),
];
const SEARCHES = [
  {
    name: 'Machine shops',
    filter: { naics: '332710' },
    days: 3,
    includedInPull: true,
    pullOrder: 0,
  },
  {
    name: 'Computer services',
    filter: { naics: '5415' },
    days: 3,
    includedInPull: true,
    pullOrder: 1,
  },
];

/**
 * The real modules over real HTTP and the real Postgres tables; only the
 * upstream adapters are scripted (behind the real gate, so the ledger and
 * the budget are exercised for real) and the clock is fixed. Every test
 * seeds what it reads through the API itself.
 */
const AWARD = awardDraftOf({ externalId: 'SPE4A726P0123-0' });

async function boot() {
  const scripted = scriptedSearch('sam.gov', PAGES);
  const contractAwards = scriptedContractAwards([awardPageOf([AWARD])]);
  const spendingAwards = scriptedSpendingAwards([
    awardPageOf([{ ...AWARD, source: 'usaspending', externalId: 'CONT_1' }]),
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
    .overrideProvider(OPPORTUNITY_SEARCH)
    .useValue(scripted)
    .overrideProvider(NOTICE_DESCRIPTIONS)
    .useValue(scriptedDescriptions('sam.gov'))
    .overrideProvider(CONTRACT_AWARDS)
    .useValue(contractAwards)
    .overrideProvider(SPENDING_AWARDS)
    .useValue(spendingAwards)
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, url: await app.getUrl(), scripted };
}

const truncate = async (em: EntityManager) => {
  await em.fork().nativeDelete(GovconSourceCall, {});
  await em.fork().nativeDelete(GovconAward, {});
  await em.fork().nativeDelete(GovconBid, {});
  await em.fork().nativeDelete(GovconOpportunity, {});
  await em.fork().nativeDelete(GovconSavedSearch, {});
  await em.fork().nativeDelete(GovconSearchProfile, {});
};

const send = (url: string, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = (url: string, path: string, body: unknown) => send(url, 'POST', path, body);
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
const get = <T>(url: string, path: string) => fetch(`${url}${path}`).then((r) => json<T>(r));

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

  /** An empty store, an empty ledger, the scripted pages from the top, the tiny profile with its two searches. */
  beforeEach(async () => {
    await truncate(em);
    scripted.script(PAGES);
    expect((await post(url, '/profiles', tinyProfile())).status).toBe(201);
    for (const search of SEARCHES) {
      expect((await post(url, '/profiles/tiny/searches', search)).status).toBe(201);
    }
  });

  afterAll(async () => {
    await truncate(em);
    await app.close();
  });

  /** Two searches, three notices stored. */
  const pulled = () => post(url, '/pulls', { profile: 'tiny', days: 2 });

  it('[GOV-8] answers health, the profiles and the source status from their contracts', async () => {
    expect(await get(url, '/health')).toEqual({ status: 'ok' });

    const profiles = await get<Envelope<StoredProfile[]>>(url, '/profiles');
    expect(profiles.data.map((profile) => [profile.id, profile.isDefault])).toEqual([
      ['tiny', true],
    ]);
    expect(profiles.data[0]?.scoring.weights).toEqual(tinyProfile().scoring.weights);
    expect(profiles.data[0]?.updatedAt).toBe(NOW.toISOString());

    const source = await get<Envelope<SourceStatus>>(url, '/source');
    expect(source.data).toEqual({
      id: 'sam.gov',
      availability: { enabled: true, reason: null },
      budget: { spent: 0, limit: 4, windowHours: 24 },
      cacheTtlHours: 0,
    });
  });

  it('[GOV-8] [GOV-13] creates, edits, defaults and removes profiles, refusing a bad document with its issues', async () => {
    const bad = await post(url, '/profiles', { ...tinyProfile(), id: 'bad', naics: [] });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues.map((i) => i.path)).toEqual(['naics']);
    expect((await post(url, '/profiles', tinyProfile())).status).toBe(409);

    const second = tinyProfile({ id: 'second', company: 'Second LLC' });
    const created = await post(url, '/profiles', second);
    expect(created.status).toBe(201);
    expect((await json<Envelope<StoredProfile>>(created)).data).toMatchObject({
      id: 'second',
      isDefault: false,
    });

    const renamed = await send(url, 'PUT', '/profiles/second', { ...second, company: 'Renamed' });
    expect(renamed.status).toBe(200);
    expect((await json<Envelope<StoredProfile>>(renamed)).data.company).toBe('Renamed');
    expect((await send(url, 'PUT', '/profiles/second', tinyProfile())).status).toBe(400);
    expect((await send(url, 'PUT', '/profiles/nope', tinyProfile({ id: 'nope' }))).status).toBe(
      404,
    );

    expect((await post(url, '/profiles/second/default', {})).status).toBe(200);
    expect((await get<Envelope<StoredProfile>>(url, '/profiles/tiny')).data.isDefault).toBe(false);
    expect((await fetch(`${url}/profiles/nope`)).status).toBe(404);

    // With no profile named, the default answers.
    const leads = await get<Envelope<LeadsReport>>(url, '/leads');
    expect(leads.data.profile).toBe('second');

    expect((await send(url, 'DELETE', '/profiles/second')).status).toBe(204);
    expect((await get<Envelope<StoredProfile>>(url, '/profiles/tiny')).data.isDefault).toBe(true);
    expect((await send(url, 'DELETE', '/profiles/tiny')).status).toBe(409);
    expect((await send(url, 'DELETE', '/profiles/nope')).status).toBe(404);
  });

  it('[GOV-8] [GOV-14] keeps saved searches per profile, runs one by itself, and runs a bare filter', async () => {
    const list = await get<Envelope<SavedSearch[]>>(url, '/profiles/tiny/searches');
    expect(list.data.map((s) => [s.name, s.includedInPull, s.pullOrder, s.lastRunAt])).toEqual([
      ['Machine shops', true, 0, null],
      ['Computer services', true, 1, null],
    ]);
    expect((await post(url, '/profiles/tiny/searches', SEARCHES[0])).status).toBe(409);
    expect((await post(url, '/profiles/nope/searches', SEARCHES[0])).status).toBe(404);
    const bad = await post(url, '/profiles/tiny/searches', {
      ...SEARCHES[0],
      name: 'x',
      filter: { naics: 'abc' },
    });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues[0]?.path).toBe('filter.naics');

    const first = pick(list.data, 0);
    const edited = await send(url, 'PUT', `/searches/${first.id}`, {
      ...SEARCHES[0],
      includedInPull: false,
    });
    expect(edited.status).toBe(200);
    expect((await json<Envelope<SavedSearch>>(edited)).data.includedInPull).toBe(false);

    const run = await post(url, `/searches/${first.id}/run`, {});
    expect(run.status).toBe(200);
    const report = (await json<Envelope<PullReport>>(run)).data;
    expect(report.slices.map((s) => [s.name, s.outcome, s.inserted])).toEqual([
      ['Machine shops', 'ok', 2],
    ]);
    expect(report.window).toEqual({ from: '2026-09-23', to: '2026-09-26' });
    expect(
      (await get<Envelope<SavedSearch[]>>(url, '/profiles/tiny/searches')).data[0]?.lastRunAt,
    ).toBe(NOW.toISOString());
    expect((await post(url, '/searches/00000000-0000-0000-0000-000000000000/run', {})).status).toBe(
      404,
    );

    scripted.script(PAGES);
    const adHoc = await post(url, '/searches/run', {
      filter: { naics: '541511', status: 'active' },
      days: 7,
    });
    expect(adHoc.status).toBe(200);
    expect(
      (await json<Envelope<PullReport>>(adHoc)).data.slices.map((s) => [s.name, s.outcome]),
    ).toEqual([[null, 'ok']]);
    expect(scripted.queries[0]).toMatchObject({
      naics: '541511',
      status: 'active',
      postedFrom: '2026-09-19',
    });
    expect(
      (await post(url, '/searches/run', { filter: { naics: '541511' }, days: 0 })).status,
    ).toBe(400);

    // Not flagged any more: the pull runs the other search only.
    scripted.script(PAGES);
    const pull = (await json<Envelope<PullReport>>(await pulled())).data;
    expect(pull.slices.map((s) => s.name)).toEqual(['Computer services']);

    expect((await send(url, 'DELETE', `/searches/${first.id}`)).status).toBe(204);
    expect((await send(url, 'DELETE', `/searches/${first.id}`)).status).toBe(404);
  });

  it('[GOV-8] refuses a bad pull body with named issues, and a window the plan cannot run', async () => {
    const bad = await post(url, '/pulls', { profile: 'tiny', days: 0, extra: 1 });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['days']),
    );

    const both = await post(url, '/pulls', {
      profile: 'tiny',
      days: 2,
      from: '2026-09-01',
      to: '2026-09-02',
    });
    expect(both.status).toBe(400);
    expect((await json<{ message: string }>(both)).message).toMatch(/alternatives/);
    const backwards = await post(url, '/pulls', {
      profile: 'tiny',
      from: '2026-09-30',
      to: '2026-09-26',
    });
    expect(backwards.status).toBe(400);
    expect((await json<{ message: string }>(backwards)).message).toMatch(/starts after it ends/);

    expect((await post(url, '/pulls', { profile: 'nope', days: 1 })).status).toBe(404);
  });

  it('[GOV-8] [GOV-14] pulls synchronously and answers the report; the ledger counts every attempt', async () => {
    const response = await pulled();
    expect(response.status).toBe(200);
    const { data: report } = await json<Envelope<PullReport>>(response);
    expect(report.window).toEqual({ from: '2026-09-24', to: '2026-09-26' });
    expect(
      report.slices.map((slice) => [slice.name, slice.outcome, slice.inserted, slice.rejected]),
    ).toEqual([
      ['Machine shops', 'ok', 2, 0],
      ['Computer services', 'ok', 1, 0],
    ]);
    expect(report).toMatchObject({ profile: 'tiny', spent: 2, budget: 4, stoppedBy: null });

    const source = await get<Envelope<SourceStatus>>(url, '/source');
    expect(source.data.budget.spent).toBe(2);
    const searches = await get<Envelope<SavedSearch[]>>(url, '/profiles/tiny/searches');
    expect(searches.data.map((s) => s.lastRunAt)).toEqual([NOW.toISOString(), NOW.toISOString()]);
  });

  it('[GOV-8] [GOV-15] ranks the store over the query filters, coerced and bounded at the edge', async () => {
    await pulled();
    const all = await get<Envelope<LeadsReport>>(url, '/leads?profile=tiny');
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

    const page2 = await get<Envelope<LeadsReport>>(url, '/leads?profile=tiny&limit=1&offset=1');
    expect(page2.data.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['c']);
    const software = await get<Envelope<LeadsReport>>(
      url,
      '/leads?profile=tiny&naics=5415&deadlineWithinDays=30',
    );
    expect(software.data.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['c']);
    expect((await fetch(`${url}/leads?profile=tiny&naics=x`)).status).toBe(400);

    const one = await get<Envelope<LeadsReport>>(url, '/leads?profile=tiny&tier=high&limit=1');
    expect(one.data.leads).toHaveLength(1);
    expect(one.data.leads[0]?.tier).toBe('high');
    expect(
      (await get<Envelope<LeadsReport>>(url, '/leads?profile=tiny&minScore=99')).data.matching,
    ).toBe(0);

    const bad = await fetch(`${url}/leads?profile=tiny&limit=0`);
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues[0]?.path).toBe('limit');
    expect((await fetch(`${url}/leads?profile=tiny&tier=huge`)).status).toBe(400);
    expect((await fetch(`${url}/leads?profile=nope`)).status).toBe(404);
  });

  it('[GOV-8] [GOV-9] shows a stored notice, fetches its description once, and reports a spent budget as an outcome', async () => {
    await pulled();
    const detail = await get<Envelope<NoticeDto>>(url, '/notices/a?profile=tiny');
    expect(detail.data.opportunity.noticeId).toBe('a');
    expect(detail.data.factors).toHaveLength(8);
    expect(detail.data.description).toBeNull();
    expect(detail.data.bid).toBeNull();
    expect(detail.data.attachments).toEqual([]);
    expect((await fetch(`${url}/notices/nope?profile=tiny`)).status).toBe(404);
    expect((await post(url, '/notices/nope/description', {})).status).toBe(404);

    const first = await post(url, '/notices/a/description', {});
    expect(first.status).toBe(200);
    expect((await json<Envelope<DescriptionFetch>>(first)).data).toEqual({
      status: 'ok',
      description: { text: 'Description of a', fetchedAt: NOW.toISOString() },
    });
    expect(
      (await json<Envelope<DescriptionFetch>>(await post(url, '/notices/a/description', {}))).data
        .status,
    ).toBe('ok');
    expect((await get<Envelope<NoticeDto>>(url, '/notices/a')).data.description?.text).toBe(
      'Description of a',
    );

    // 2 searches + 1 description = 3 of 4; the next description spends the last, the one after is refused.
    expect(
      (await json<Envelope<DescriptionFetch>>(await post(url, '/notices/c/description', {}))).data
        .status,
    ).toBe('ok');
    const refused = (
      await json<Envelope<DescriptionFetch>>(await post(url, '/notices/b/description', {}))
    ).data;
    expect(refused).toEqual({ status: 'budget-exhausted', spent: 4, budget: 4 });

    // Every row carries the fixed clock, so the order among them is not meaningful — the counts are.
    const page = await get<Page<SourceCall>>(url, '/source/calls?limit=3');
    expect(page.meta).toEqual({ total: 4, limit: 3, offset: 0 });
    expect(page.data).toHaveLength(3);
    const calls = await get<Page<SourceCall>>(url, '/source/calls?limit=10');
    expect(calls.data.map((call) => call.operation).sort()).toEqual([
      'description',
      'description',
      'search',
      'search',
    ]);
    expect(calls.data.every((call) => call.attempt === 1)).toBe(true);
    expect(
      calls.data
        .filter((call) => call.operation === 'description')
        .map((call) => (call.query as { noticeId: string }).noticeId)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(JSON.stringify(calls)).not.toContain('api_key');
    expect((await fetch(`${url}/source/calls?limit=0`)).status).toBe(400);
  });

  it('[GOV-8] [GOV-12] puts a bid on a stored notice, shows it on the notice, lists the pipeline, and removes it', async () => {
    await pulled();
    expect((await send(url, 'PUT', '/notices/nope/bid', { stage: 'watching' })).status).toBe(404);
    const bad = await send(url, 'PUT', '/notices/a/bid', { stage: 'dreaming' });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues[0]?.path).toBe('stage');

    const saved = await send(url, 'PUT', '/notices/a/bid', {
      stage: 'qualifying',
      notes: 'Ask for the drawing',
      reminderAt: '2026-09-29T09:00:00.000Z',
      estimatedValue: 48000,
    });
    expect(saved.status).toBe(200);
    expect((await json<Envelope<Bid>>(saved)).data).toMatchObject({
      noticeId: 'a',
      stage: 'qualifying',
      notes: 'Ask for the drawing',
      reminderAt: '2026-09-29T09:00:00.000Z',
      estimatedValue: 48000,
      stageChangedAt: NOW.toISOString(),
    });
    expect((await get<Envelope<NoticeDto>>(url, '/notices/a')).data.bid?.stage).toBe('qualifying');
    await send(url, 'PUT', '/notices/c/bid', { stage: 'passed' });

    const pipeline = await get<Page<PipelineRow>>(url, '/pipeline?stage=qualifying');
    expect(pipeline.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    expect(pipeline.data.map((row) => [row.bid.noticeId, row.lead.tier])).toEqual([['a', 'high']]);
    expect((await get<Page<PipelineRow>>(url, '/pipeline')).meta.total).toBe(2);
    expect((await fetch(`${url}/pipeline?stage=dreaming`)).status).toBe(400);
    expect((await get<Envelope<BidPipelineSummary>>(url, '/pipeline/summary')).data).toMatchObject({
      byStage: { qualifying: 1, passed: 1, watching: 0 },
      dueSoon: 1,
      total: 2,
    });

    expect((await send(url, 'DELETE', '/notices/a/bid')).status).toBe(204);
    expect((await send(url, 'DELETE', '/notices/a/bid')).status).toBe(404);
    expect((await get<Envelope<NoticeDto>>(url, '/notices/a')).data.bid).toBeNull();
  });

  it('[GOV-8] [GOV-17] fetches awards from both sources through the gate, then lists and summarizes them, and the notice sees its solicitation', async () => {
    const bad = await post(url, '/awards/fetch', {
      from: '2026-06-01',
      to: '2026-01-01',
      sources: ['sam.gov'],
    });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues.map((i) => i.path).sort()).toEqual(['naics', 'to']);

    const fetched = await post(url, '/awards/fetch', {
      naics: ['332710'],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov', 'usaspending'],
    });
    expect(fetched.status).toBe(200);
    const report = (await json<Envelope<FetchAwardsReport>>(fetched)).data;
    expect(report.slices.map((s) => [s.source, s.outcome, s.inserted])).toEqual([
      ['sam.gov', 'ok', 1],
      ['usaspending', 'ok', 1],
    ]);
    expect(report).toMatchObject({ spent: 1, budget: 4 });
    const calls = await get<Page<SourceCall>>(url, '/source/calls?limit=10');
    expect(calls.data.map((call) => [call.source, call.operation]).sort()).toEqual([
      ['sam.gov', 'awards'],
      ['usaspending', 'spending'],
    ]);

    const list = await get<Page<Award>>(url, '/awards?naics=3327&source=sam.gov');
    expect(list.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    expect(list.data[0]).toMatchObject({ externalId: 'SPE4A726P0123-0', amount: 52000 });
    expect((await get<Page<Award>>(url, '/awards')).meta.total).toBe(2);
    expect((await fetch(`${url}/awards?source=other`)).status).toBe(400);
    const summary = await get<Envelope<AwardsSummary>>(url, '/awards/summary?naics=332710');
    expect(summary.data).toMatchObject({
      count: 2,
      total: 104000,
      bySource: { 'sam.gov': 1, usaspending: 1 },
    });

    await pulled();
    const notice = await get<Envelope<NoticeDto>>(url, '/notices/a');
    expect(notice.data.awards.bySolicitation.map((a) => a.externalId).sort()).toEqual([
      'CONT_1',
      'SPE4A726P0123-0',
    ]);
    expect(notice.data.awards.related.count).toBe(2);
    expect(notice.data.factors.find((f) => f.id === 'history')?.evidence[0]).toBe(
      '2 stored award(s) in naics 332710 in the last 365 day(s)',
    );
  });
});
