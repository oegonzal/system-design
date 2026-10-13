import { stubApi } from '@sysdesign/web-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AWARDS,
  AWARDS_SUMMARY,
  BID,
  CALLS,
  DESCRIPTION,
  ENTITY,
  makeLeadDetail,
  makeLeadsReport,
  makePullReport,
  PIPELINE_ROWS,
  PIPELINE_SUMMARY,
  PROFILE,
  SAVED_SEARCHES,
  SOURCE_STATUS,
} from '../testing/fixtures';
import { AGENCIES, AGENCY_OUTLOOK, BREAKDOWN, HORIZON, PULSE } from '../testing/spending-fixtures';
import { api } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('govcon api client', () => {
  it('[GOVU-1] reads the profiles and the source status, unwrapping the envelope, and starts a pull with a JSON body', async () => {
    const report = makePullReport();
    const { calls, fetchMock } = stubApi([
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/source', body: { data: SOURCE_STATUS } },
      { method: 'POST', path: '/pulls', body: { data: report } },
    ]);

    expect(await api.listProfiles()).toEqual([PROFILE]);
    expect(await api.getSource()).toEqual(SOURCE_STATUS);
    expect(await api.startPull({ profile: 'enfav', days: 3 })).toEqual(report);
    expect(calls.map((call) => call.url)).toEqual(['/profiles', '/source', '/pulls']);
    const init = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ profile: 'enfav', days: 3 });
  });

  it('[GOVU-2] lists leads with the query string and reads one notice by id for a profile', async () => {
    const report = makeLeadsReport();
    const detail = makeLeadDetail({ description: DESCRIPTION });
    const { calls } = stubApi([
      { path: '/leads', body: { data: report } },
      { path: `/notices/${detail.opportunity.noticeId}`, body: { data: detail } },
    ]);

    expect(
      await api.listLeads({ profile: 'enfav', minScore: 40, tier: 'high', limit: 10 }),
    ).toEqual(report);
    expect(await api.getNotice(detail.opportunity.noticeId, 'enfav')).toEqual(detail);
    expect(calls.map((call) => call.url)).toEqual([
      '/leads?profile=enfav&minScore=40&tier=high&limit=10',
      `/notices/${detail.opportunity.noticeId}?profile=enfav`,
    ]);
  });

  it('[GOVU-3] asks for a description with a POST and hands back the outcome as it came', async () => {
    const outcome = { status: 'budget-exhausted', spent: 10, budget: 10 } as const;
    const { calls, fetchMock } = stubApi([
      { method: 'POST', path: /\/notices\/[^/]+\/description$/, body: { data: outcome } },
    ]);
    expect(await api.fetchDescription('abc')).toEqual(outcome);
    expect(calls[0]).toEqual({ method: 'POST', url: '/notices/abc/description' });
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('[GOVU-4] lists the ledger with the query string and keeps the page meta', async () => {
    const meta = { total: 3, limit: 2, offset: 0 };
    const { calls } = stubApi([{ path: '/source/calls', body: { data: CALLS.slice(0, 2), meta } }]);
    const page = await api.listCalls({ limit: 2 });
    expect(page.data).toEqual(CALLS.slice(0, 2));
    expect(page.meta).toEqual(meta);
    expect(calls[0]?.url).toBe('/source/calls?limit=2');
  });

  it('[GOVU-6] [GOVU-7] [GOVU-9] [GOVU-10] reaches every other route with its method, body and query, unwrapping single resources and keeping list envelopes', async () => {
    const meta = { total: 1, limit: 50, offset: 0 };
    const { calls, fetchMock } = stubApi([
      { method: 'POST', path: '/profiles', body: { data: PROFILE } },
      { method: 'PUT', path: '/profiles/enfav', body: { data: PROFILE } },
      { method: 'DELETE', path: '/profiles/enfav', status: 204 },
      { method: 'POST', path: '/profiles/enfav/default', body: { data: PROFILE } },
      { path: '/profiles/enfav/searches', body: { data: SAVED_SEARCHES } },
      { method: 'POST', path: '/profiles/enfav/searches', body: { data: SAVED_SEARCHES[0] } },
      { method: 'PUT', path: '/searches/s-1', body: { data: SAVED_SEARCHES[0] } },
      { method: 'DELETE', path: '/searches/s-1', status: 204 },
      { method: 'POST', path: '/searches/s-1/run', body: { data: makePullReport() } },
      { method: 'POST', path: '/searches/run', body: { data: makePullReport() } },
      { method: 'PUT', path: /\/notices\/[^/]+\/bid$/, body: { data: BID } },
      { method: 'DELETE', path: /\/notices\/[^/]+\/bid$/, status: 204 },
      { path: '/pipeline', body: { data: PIPELINE_ROWS, meta } },
      { path: '/pipeline/summary', body: { data: PIPELINE_SUMMARY } },
      { path: '/awards', body: { data: AWARDS, meta } },
      { path: '/awards/summary', body: { data: AWARDS_SUMMARY } },
      {
        method: 'POST',
        path: '/awards/fetch',
        body: { data: { slices: [], spent: 1, budget: 1000 } },
      },
      { path: '/entities/own', body: { data: ENTITY } },
      {
        method: 'POST',
        path: '/entities/lookup',
        body: { data: { entities: [ENTITY], unknown: [], spent: 1, budget: 1000 } },
      },
    ]);
    expect(await api.createProfile(PROFILE)).toEqual(PROFILE);
    expect(await api.updateProfile('enfav', PROFILE)).toEqual(PROFILE);
    expect(await api.deleteProfile('enfav')).toBeUndefined();
    expect(await api.setDefaultProfile('enfav')).toEqual(PROFILE);
    expect(await api.listSearches('enfav')).toEqual(SAVED_SEARCHES);
    const search = { name: 'x', filter: { naics: '332710' }, days: 3, includedInPull: true };
    expect(await api.createSearch('enfav', search)).toEqual(SAVED_SEARCHES[0]);
    expect(await api.updateSearch('s-1', search)).toEqual(SAVED_SEARCHES[0]);
    await api.deleteSearch('s-1');
    expect((await api.runSearch('s-1', { days: 7 })).profile).toBe('enfav');
    expect((await api.runFilter({ filter: { naics: '5415' }, days: 3 })).profile).toBe('enfav');
    expect(await api.saveBid('abc', { stage: 'watching' })).toEqual(BID);
    await api.removeBid('abc');
    expect((await api.listPipeline({ stage: 'watching', limit: 5 })).data).toEqual(PIPELINE_ROWS);
    expect(await api.getPipelineSummary()).toEqual(PIPELINE_SUMMARY);
    expect((await api.listAwards({ naics: '3327', source: 'sam.gov' })).meta).toEqual(meta);
    expect(await api.getAwardsSummary({ naics: '332710' })).toEqual(AWARDS_SUMMARY);
    expect(
      (
        await api.fetchAwards({
          naics: ['332710'],
          from: '2026-01-01',
          to: '2026-09-29',
          sources: ['sam.gov'],
        })
      ).spent,
    ).toBe(1);
    expect(await api.getOwnEntity('enfav')).toEqual(ENTITY);
    expect((await api.lookupEntities({ ueis: ['ABC123DEF456'] })).entities).toEqual([ENTITY]);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /profiles',
      'PUT /profiles/enfav',
      'DELETE /profiles/enfav',
      'POST /profiles/enfav/default',
      'GET /profiles/enfav/searches',
      'POST /profiles/enfav/searches',
      'PUT /searches/s-1',
      'DELETE /searches/s-1',
      'POST /searches/s-1/run',
      'POST /searches/run',
      'PUT /notices/abc/bid',
      'DELETE /notices/abc/bid',
      'GET /pipeline?stage=watching&limit=5',
      'GET /pipeline/summary',
      'GET /awards?naics=3327&source=sam.gov',
      'GET /awards/summary?naics=332710',
      'POST /awards/fetch',
      'GET /entities/own?profile=enfav',
      'POST /entities/lookup',
    ]);
    const saved = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith('/notices/abc/bid') && (call[1] as RequestInit).method === 'PUT',
    );
    expect(JSON.parse(String((saved?.[1] as RequestInit).body))).toEqual({ stage: 'watching' });
  });
});

describe('govcon api client — spending', () => {
  it('[GOVU-11] reads the five spending routes with the scope comma-joined on the wire, unwrapping each envelope', async () => {
    const { calls } = stubApi([
      { path: '/spending/pulse', body: { data: PULSE } },
      { path: '/spending/breakdown', body: { data: BREAKDOWN } },
      { path: '/spending/horizon', body: { data: HORIZON } },
      { path: '/spending/agencies', body: { data: AGENCIES } },
      { path: '/spending/agencies/097', body: { data: AGENCY_OUTLOOK } },
    ]);
    expect(
      await api.getSpendingPulse({ naics: ['332710', '541511'], awardFamily: 'both', lookback: 3 }),
    ).toEqual(PULSE);
    expect(
      await api.getSpendingBreakdown({
        awardFamily: 'contracts',
        category: 'awarding_agency',
        from: '2025-10-01',
        to: '2026-06-15',
      }),
    ).toEqual(BREAKDOWN);
    expect(await api.getSpendingHorizon({ psc: ['5340'], months: 12 })).toEqual(HORIZON);
    expect(await api.listAgencies()).toEqual(AGENCIES);
    expect(await api.getAgencyOutlook('097', { awardFamily: 'both' })).toEqual(AGENCY_OUTLOOK);
    expect(calls.map((call) => call.url)).toEqual([
      '/spending/pulse?naics=332710%2C541511&awardFamily=both&lookback=3',
      '/spending/breakdown?awardFamily=contracts&category=awarding_agency&from=2025-10-01&to=2026-06-15',
      '/spending/horizon?psc=5340&months=12',
      '/spending/agencies',
      '/spending/agencies/097?awardFamily=both',
    ]);
  });
});
