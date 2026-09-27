import { stubApi } from '@sysdesign/web-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CALLS,
  DESCRIPTION,
  makeLeadDetail,
  makeLeadsReport,
  makePullReport,
  PROFILE,
  SOURCE_STATUS,
} from '../testing/fixtures';
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
      { path: `/opportunities/${detail.opportunity.noticeId}`, body: { data: detail } },
    ]);

    expect(
      await api.listLeads({ profile: 'enfav', minScore: 40, tier: 'high', limit: 10 }),
    ).toEqual(report);
    expect(await api.getOpportunity(detail.opportunity.noticeId, 'enfav')).toEqual(detail);
    expect(calls.map((call) => call.url)).toEqual([
      '/leads?profile=enfav&minScore=40&tier=high&limit=10',
      `/opportunities/${detail.opportunity.noticeId}?profile=enfav`,
    ]);
  });

  it('[GOVU-3] asks for a description with a POST and hands back the outcome as it came', async () => {
    const outcome = { status: 'budget-exhausted', spent: 10, budget: 10 } as const;
    const { calls, fetchMock } = stubApi([
      { method: 'POST', path: /\/opportunities\/[^/]+\/description$/, body: { data: outcome } },
    ]);
    expect(await api.fetchDescription('abc')).toEqual(outcome);
    expect(calls[0]).toEqual({ method: 'POST', url: '/opportunities/abc/description' });
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
});
