import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  DescriptionResultDto,
  LeadDetailDto,
  LeadsReport,
  PullReport,
  SearchProfile,
  SourceCallDto,
  SourceStatusDto,
} from '@sysdesign/contracts';
import { ensureDatabase, GovconOpportunity, GovconSourceCall } from '@sysdesign/db';

import { BudgetedSource, type BudgetPolicy } from '../../core/budgeted-source';
import type { SourceCallLog } from '../../core/ports';
import { fetched, okResult, scriptedSource, tinyProfile } from '../../core/testing';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import {
  BUDGET_POLICY,
  CLOCK,
  OPPORTUNITY_SOURCE,
  SEARCH_PROFILES,
  SOURCE_CALL_LOG,
} from './tokens';

type Envelope<T> = { data: T };
type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

const NOW = new Date('2026-09-26T12:00:00Z');

/**
 * The real module over real HTTP and the real Postgres ledger; only the
 * upstream is scripted (wrapped in the real budgeted source, so the ledger and
 * the budget are exercised for real), the clock is fixed and the registry is
 * the tiny profile with two slices.
 */
async function boot(): Promise<{ app: INestApplication; url: string }> {
  const scripted = scriptedSource('sam.gov', [
    okResult([fetched({ noticeId: 'a' }), fetched({ noticeId: 'b', setAsideCode: '8A' })]),
    okResult([fetched({ noticeId: 'c', naicsCode: '541511', naicsCodes: ['541511'] })]),
  ]);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(() => NOW)
    .overrideProvider(BUDGET_POLICY)
    .useValue({ dailyBudget: 4, ttlMs: 0 } satisfies BudgetPolicy)
    .overrideProvider(SEARCH_PROFILES)
    .useValue(new Map([['tiny', tinyProfile()]]))
    .overrideProvider(OPPORTUNITY_SOURCE)
    .useFactory({
      factory: (log: SourceCallLog, policy: BudgetPolicy, now: () => Date) =>
        new BudgetedSource(scripted, log, policy, now),
      inject: [SOURCE_CALL_LOG, BUDGET_POLICY, CLOCK],
    })
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, url: await app.getUrl() };
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

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await boot());
    em = app.get(EntityManager);
    await truncate(em);
  });

  afterAll(async () => {
    await truncate(em);
    await app.close();
  });

  it('[GOV-8] answers health, the profile registry and the source status from their contracts', async () => {
    expect((await (await fetch(`${url}/health`)).json()) as unknown).toEqual({ status: 'ok' });

    const profiles = (await (await fetch(`${url}/profiles`)).json()) as Envelope<SearchProfile[]>;
    expect(profiles.data.map((profile) => profile.id)).toEqual(['tiny']);
    expect(profiles.data[0]?.scoring.weights).toEqual(tinyProfile().scoring.weights);

    const source = (await (await fetch(`${url}/source`)).json()) as Envelope<SourceStatusDto>;
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

    const source = (await (await fetch(`${url}/source`)).json()) as Envelope<SourceStatusDto>;
    expect(source.data.budget.spent).toBe(2);
  });

  it('[GOV-8] ranks the store over the query filters, coerced and bounded at the edge', async () => {
    const all = (await (await fetch(`${url}/leads?profile=tiny`)).json()) as Envelope<LeadsReport>;
    expect(all.data).toMatchObject({ profile: 'tiny', candidates: 3, excluded: 1, matching: 2 });
    expect(all.data.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['a', 'c']);

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
    const detail = (await (
      await fetch(`${url}/opportunities/a?profile=tiny`)
    ).json()) as Envelope<LeadDetailDto>;
    expect(detail.data.opportunity.noticeId).toBe('a');
    expect(detail.data.factors).toHaveLength(6);
    expect(detail.data.description).toBeNull();
    expect((await fetch(`${url}/opportunities/nope?profile=tiny`)).status).toBe(404);
    expect((await post(url, '/opportunities/nope/description', {})).status).toBe(404);

    const first = await post(url, '/opportunities/a/description', {});
    expect(first.status).toBe(200);
    expect(((await first.json()) as Envelope<DescriptionResultDto>).data).toEqual({
      status: 'ok',
      description: { text: 'Description of a', fetchedAt: NOW.toISOString() },
    });
    const again = (
      (await (
        await post(url, '/opportunities/a/description', {})
      ).json()) as Envelope<DescriptionResultDto>
    ).data;
    expect(again.status).toBe('ok');

    const shown = (await (
      await fetch(`${url}/opportunities/a?profile=tiny`)
    ).json()) as Envelope<LeadDetailDto>;
    expect(shown.data.description?.text).toBe('Description of a');

    // 2 searches + 1 description = 3 of 4; the next description spends the last, the one after is refused.
    expect(
      (
        (await (
          await post(url, '/opportunities/c/description', {})
        ).json()) as Envelope<DescriptionResultDto>
      ).data.status,
    ).toBe('ok');
    const refused = (
      (await (
        await post(url, '/opportunities/b/description', {})
      ).json()) as Envelope<DescriptionResultDto>
    ).data;
    expect(refused).toEqual({ status: 'budget-exhausted', spent: 4, budget: 4 });

    // Every row carries the fixed clock, so the order among them is not meaningful — the counts are.
    const page = (await (await fetch(`${url}/source/calls?limit=3`)).json()) as Page<SourceCallDto>;
    expect(page.meta).toEqual({ total: 4, limit: 3, offset: 0 });
    expect(page.data).toHaveLength(3);
    const calls = (await (
      await fetch(`${url}/source/calls?limit=10`)
    ).json()) as Page<SourceCallDto>;
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
