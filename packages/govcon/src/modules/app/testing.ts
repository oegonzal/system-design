import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  ensureDatabase,
  GovconAlert,
  GovconAward,
  GovconBid,
  GovconEntity,
  GovconOpportunity,
  GovconSavedSearch,
  GovconSavedView,
  GovconSearchProfile,
  GovconSourceCall,
  GovconSpendingSnapshot,
  GovconTarget,
  truncateTestTables,
} from '@sysdesign/db';

import type { BudgetPolicy } from '../../core/budget';
import {
  RecordingAlertSink,
  scriptedSpendingSources,
  type ScriptedSpendingSources,
  type SpendingScript,
} from '../../core/spending/testing';
import {
  awardDraftOf,
  awardPageOf,
  entityBatchOf,
  entityDraftOf,
  okPage,
  opportunityOf,
  scriptedContractAwards,
  scriptedDescriptions,
  scriptedRegistry,
  scriptedSearch,
  scriptedSpendingAwards,
  tinyProfile,
} from '../../core/testing';
import {
  BUDGET_POLICY,
  CLOCK,
  CONTRACT_AWARDS,
  ENTITY_REGISTRY,
  NOTICE_DESCRIPTIONS,
  OPPORTUNITY_SEARCH,
  SPENDING_AWARDS,
  SPENDING_SOURCES,
} from '../sources/tokens';
import { ALERT_SINK, SPENDING_WARM_POLICY } from '../spending/tokens';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

/**
 * The HTTP harness every `*.http.spec.ts` boots: the real modules over real
 * HTTP and the real Postgres tables, only the upstream adapters scripted
 * (behind the real gate, so the ledger and the budget are exercised for
 * real), the clock fixed, the spending warm's cadence null and its sink a
 * recorder — the suite asserts exact ledger counts, so nothing may spend
 * behind its back. No vitest imports: a spec asserts, this only boots.
 */
export type Envelope<T> = { data: T };
export type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };
export type Issues = { issues: { path: string; message: string }[] };

export const NOW = new Date('2026-09-26T12:00:00Z');

/** The two saved searches of the tiny profile: three notices, one of them a set-aside the profile cannot bid. */
export const PAGES = [
  okPage([opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b', setAsideCode: '8A' })]),
  okPage([opportunityOf({ noticeId: 'c', naicsCode: '541511', naicsCodes: ['541511'] })]),
];
export const SEARCHES = [
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
/** The one award each scripted award source answers: SAM.gov's page, and USAspending's twin under its own id. */
const AWARD = awardDraftOf({ externalId: 'SPE4A726P0123-0' });

export interface GovconHttp {
  app: INestApplication;
  url: string;
  em: EntityManager;
  scripted: ReturnType<typeof scriptedSearch>;
  spending: ScriptedSpendingSources;
  /** What the warm would have published — nothing, in this suite. */
  sink: RecordingAlertSink;
}

export async function bootGovconHttp(spending: SpendingScript = {}): Promise<GovconHttp> {
  // Before anything connects: a database that is not a test one is refused here.
  await ensureDatabase();
  const scripted = scriptedSearch('sam.gov', PAGES);
  const spendingSources = scriptedSpendingSources(spending);
  const sink = new RecordingAlertSink();
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
    .overrideProvider(SPENDING_SOURCES)
    .useValue(spendingSources)
    .overrideProvider(ENTITY_REGISTRY)
    .useValue(scriptedRegistry([entityBatchOf([entityDraftOf()])]))
    .overrideProvider(SPENDING_WARM_POLICY)
    .useValue({ everyMs: null })
    .overrideProvider(ALERT_SINK)
    .useValue(sink)
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  return {
    app,
    url: await app.getUrl(),
    em: app.get(EntityManager),
    scripted,
    spending: spendingSources,
    sink,
  };
}

/** Every govcon table emptied. */
export const truncateGovcon = (em: EntityManager): Promise<void> =>
  truncateTestTables(em, [
    GovconSourceCall,
    GovconSpendingSnapshot,
    GovconAlert,
    GovconAward,
    GovconEntity,
    GovconBid,
    GovconOpportunity,
    GovconSavedSearch,
    GovconSavedView,
    GovconTarget,
    GovconSearchProfile,
  ]);

export const send = (url: string, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const post = (url: string, path: string, body: unknown) => send(url, 'POST', path, body);
export const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
export const get = <T>(url: string, path: string) => fetch(`${url}${path}`).then((r) => json<T>(r));

/** An empty store, an empty ledger, every script from the top, the tiny profile with its two searches. */
export async function resetGovcon({ em, url, scripted, spending }: GovconHttp): Promise<void> {
  await truncateGovcon(em);
  scripted.script(PAGES);
  spending.script();
  const created = await post(url, '/profiles', tinyProfile());
  if (created.status !== 201)
    throw new Error(`seeding the tiny profile answered ${created.status}`);
  for (const search of SEARCHES) {
    const saved = await post(url, '/profiles/tiny/searches', search);
    if (saved.status !== 201) throw new Error(`seeding ${search.name} answered ${saved.status}`);
  }
}

/** The tiny profile's pull: two searches, three notices stored. */
export const pullTiny = (url: string) => post(url, '/pulls', { profile: 'tiny', days: 2 });
