import { stubApi } from '@sysdesign/web-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AGENCIES, AGENCY_OUTLOOK, BREAKDOWN, HORIZON, PULSE } from '../testing/spending-fixtures';
import { api } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
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
