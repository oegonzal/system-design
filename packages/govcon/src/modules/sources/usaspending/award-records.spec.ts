import {
  normalizeAwardOrders,
  normalizeAwardRecord,
  UsaSpendingAwardRecords,
} from './award-records';
import detail from './fixtures/award-detail.json';
import roster from './fixtures/award-subawards.json';
import amounts from './fixtures/idv-amounts.json';
import { USASPENDING_BASE_URL } from './source';
import { bodyOf, httpOf, okValue } from './testing';

const ID = 'CONT_AWD_89303019FET000003_8900_89303019AET000001_8900';

describe('the USAspending award records', () => {
  it('[GOV-11] [GOV-30] reads one award by its id and normalizes its holder and parent, buyer, vehicle, money, both end dates, how it was competed, the subcontracting plan it carries and what was subcontracted', async () => {
    const { http, urls, requests } = httpOf([{ body: detail }]);
    const { attempts, result } = await new UsaSpendingAwardRecords(http).detail({
      externalId: ID,
    });
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/awards/${ID}/`);
    expect(requests[0]?.method).toBe('GET');
    expect(attempts).toHaveLength(1);
    expect(okValue(result)).toEqual({
      externalId: ID,
      piid: '89303019FET000003',
      family: 'contracts',
      typeDescription: 'BPA CALL',
      description: 'THIS CALL PROVIDES INCREMENTAL FUNDING FOR NON-IT CYSOC SUPPORT',
      recipient: { uei: 'JCBMLGPE6Z71', name: 'BOOZ ALLEN HAMILTON INC' },
      parent: { uei: 'MBPHTU7Y9S65', name: 'BOOZ ALLEN HAMILTON HOLDING CORPORATION' },
      agencyPath: 'Department of Energy.Department of Energy.HEADQUARTERS PROCUREMENT SERVICES',
      agencyCode: '089.8900',
      vehicle: {
        externalId: 'CONT_IDV_89303019AET000001_8900',
        piid: '89303019AET000001',
        kind: 'BPA',
        agency: 'Department of Energy',
        holders: 'SINGLE AWARD',
      },
      holders: null,
      obligated: 44095065.78,
      exercised: 45969821.2,
      ceiling: 46119821.2,
      signedAt: '2019-09-27',
      startsAt: '2019-09-27',
      endsAt: '2026-12-26',
      endsWithOptionsAt: '2026-12-26',
      naicsCode: '541511',
      naicsDescription: 'CUSTOM COMPUTER PROGRAMMING SERVICES',
      pscCode: 'D310',
      pscDescription: 'IT AND TELECOM- CYBER SECURITY AND DATA BACKUP',
      placeOfPerformance: 'WASHINGTON, DC',
      competition: {
        offers: null,
        setAsideCode: null,
        setAside: null,
        extentCompeted: 'FULL AND OPEN COMPETITION',
        solicitationProcedures: 'SUBJECT TO MULTIPLE AWARD FAIR OPPORTUNITY',
        pricing: 'TIME AND MATERIALS',
        solicitationId: null,
      },
      subcontractingPlan: { code: 'F', description: 'INDIVIDUAL SUBCONTRACT PLAN' },
      subcontractCount: 7,
      subcontractAmount: 30993310.09,
    });
  });

  it('[GOV-30] reads a count of offers as it is and the not-counted placeholder as unknown, a vehicle as its own family with its holders and no vehicle above it, and anything that is neither a contract nor a vehicle as no award', () => {
    const terms = detail.latest_transaction_contract_data;
    const offers = (count: unknown) =>
      normalizeAwardRecord({
        ...detail,
        latest_transaction_contract_data: { ...terms, number_of_offers_received: count },
      })?.competition.offers;
    // The source spells the count as text; 999 is what its schedule records carry.
    expect([offers('999'), offers(999), offers('3'), offers(1), offers(null)]).toEqual([
      null,
      null,
      3,
      1,
      null,
    ]);

    const vehicle = normalizeAwardRecord({
      ...detail,
      category: 'idv',
      type_description: 'FSS',
      parent_award: null,
      period_of_performance: {
        start_date: '2023-07-13',
        end_date: '2028-07-12',
        potential_end_date: null,
      },
      recipient: { recipient_name: 'PROSCOPEO LLC', recipient_uei: null },
      latest_transaction_contract_data: {
        ...terms,
        multiple_or_single_award_description: 'MULTIPLE AWARD',
      },
    });
    expect(vehicle).toMatchObject({
      family: 'idvs',
      vehicle: null,
      holders: 'MULTIPLE AWARD',
      endsAt: '2028-07-12',
      endsWithOptionsAt: null,
      recipient: { uei: null, name: 'PROSCOPEO LLC' },
      parent: null,
    });

    // A firm the source names as its own parent has none.
    const own = {
      recipient_name: 'SCHNEIDER ELECTRIC FEDERAL, INC.',
      recipient_uei: 'NTW5TQ1UJF57',
    };
    expect(
      normalizeAwardRecord({
        ...detail,
        recipient: {
          ...own,
          parent_recipient_name: own.recipient_name,
          parent_recipient_uei: own.recipient_uei,
        },
      })?.parent,
    ).toBeNull();

    expect(normalizeAwardRecord({ ...detail, category: 'grant' })).toBeNull();
    expect(normalizeAwardRecord({ piid: 'x' })).toBeNull();
  });

  it('[GOV-11] [GOV-30] reads what was ordered under a vehicle in one request — its own orders and those placed through the vehicles awarded under it as one count and one total — and refuses an answer it cannot read', async () => {
    const VEHICLE = 'CONT_IDV_W912DY20D0079_9700';
    const { http, urls, requests } = httpOf([{ body: amounts }]);
    const { attempts, result } = await new UsaSpendingAwardRecords(http).orders({
      externalId: VEHICLE,
    });
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/idvs/amounts/${VEHICLE}/`);
    expect(requests[0]?.method).toBe('GET');
    expect(attempts).toHaveLength(1);
    expect(okValue(result)).toEqual({ count: 9, obligated: 47594534.33, vehicles: 0 });

    // A schedule: three agreements awarded under it, and the orders placed under those.
    expect(
      normalizeAwardOrders({
        child_idv_count: 3,
        child_award_count: 2,
        child_award_total_obligation: 1_000,
        grandchild_award_count: 40,
        grandchild_award_total_obligation: '250000.5',
      }),
    ).toEqual({ count: 42, obligated: 251_000.5, vehicles: 3 });
    // Nothing ordered yet reads as zero, never as unknown.
    expect(normalizeAwardOrders({})).toEqual({ count: 0, obligated: 0, vehicles: 0 });

    const odd = httpOf([{ body: [] }]);
    expect(
      (await new UsaSpendingAwardRecords(odd.http).orders({ externalId: VEHICLE })).result,
    ).toMatchObject({ kind: 'error', outcome: 'invalid-response' });
    const down = httpOf([{ status: 503, body: {} }]);
    expect(
      (await new UsaSpendingAwardRecords(down.http).orders({ externalId: VEHICLE })).result,
    ).toMatchObject({ kind: 'error' });
  });

  it('[GOV-11] [GOV-30] answers an id the source does not have as no award, a failure as the failure, and lists an award’s largest subcontracts in one request', async () => {
    const gone = httpOf([{ status: 404, body: { detail: 'No Award found' } }]);
    const missing = await new UsaSpendingAwardRecords(gone.http).detail({ externalId: 'NOPE' });
    expect(missing.result).toEqual({ kind: 'ok', value: null, recordCount: 0, totalRecords: null });
    expect(missing.attempts).toHaveLength(1);

    const down = httpOf([{ status: 429, body: {} }]);
    expect(
      (await new UsaSpendingAwardRecords(down.http).detail({ externalId: ID })).result,
    ).toMatchObject({ kind: 'error', outcome: 'rate-limited' });

    const { http, urls, requests } = httpOf([{ body: roster }]);
    const { result } = await new UsaSpendingAwardRecords(http).subcontracts({
      externalId: ID,
      limit: 10,
    });
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/subawards/`);
    expect(bodyOf(requests[0])).toEqual({
      award_id: ID,
      limit: 10,
      page: 1,
      sort: 'amount',
      order: 'desc',
    });
    const rows = okValue(result);
    expect(rows.map((row) => [row.id, row.name, row.amount, row.actionDate])).toEqual([
      ['10747444', 'CLEARFOCUS TECHNOLOGIES LLC', 15_300_000, '2020-02-25'],
      ['10656892', 'KFORCE INC.', 6_000_000, '2023-04-21'],
      ['10656893', 'PHIA LLC', 3_307_976.8, '2021-04-30'],
    ]);
    expect(rows[1]?.description).toBe('COMMERCIAL STAFFING SERVICES.');
  });
});
