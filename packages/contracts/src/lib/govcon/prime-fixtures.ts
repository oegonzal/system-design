import type { AwardBody, AwardDetail } from './award-detail';
import { NO_FACETS } from './facets';
import type { PrimeRow, SpendingPrimes } from './primes';
import { provenanceOf, spendingScopeOf } from './spending-fixtures';

/**
 * Wire-shaped builders for the primes ranking and one award's record, each
 * taking overrides. The story is one order under a single-award vehicle at
 * the Department of Energy, held by a large prime that reports its
 * subcontracts, read on 2026-06-15.
 */
export const primeRowOf = (overrides: Partial<PrimeRow> = {}): PrimeRow => ({
  uei: 'JCBMLGPE6Z71',
  name: 'BOOZ ALLEN HAMILTON INC.',
  subcontracts: 320,
  amount: 96_400_000,
  subcontractors: 157,
  serviceShare: 0.92,
  obligations: 3_100_000_000,
  topSubcontractors: [
    { uei: 'JLW7WAKPEKD4', name: 'TELOS CORPORATION', subcontracts: 9, amount: 6_100_000 },
    { uei: null, name: 'A FIRM WITHOUT A UEI', subcontracts: 4, amount: 900_000 },
  ],
  ...overrides,
});

export const spendingPrimesOf = (overrides: Partial<SpendingPrimes> = {}): SpendingPrimes => ({
  scope: spendingScopeOf({ naics: ['541511'], awardFamily: 'contracts', facets: NO_FACETS }),
  from: '2024-10-01',
  to: '2025-09-30',
  band: { min: 50_000, max: 2_000_000 },
  total: 16_771,
  read: 3_000,
  duplicates: 94,
  capped: true,
  reachedBack: '2025-04-03',
  primeCount: 158,
  subcontractorCount: 1_126,
  primes: [
    primeRowOf(),
    primeRowOf({
      uei: 'SMNWM6HN79X5',
      name: 'GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.',
      subcontracts: 298,
      amount: 91_000_000,
      subcontractors: 157,
      serviceShare: 0.88,
      obligations: 3_000_000_000,
      topSubcontractors: [],
    }),
    primeRowOf({
      uei: null,
      name: 'A PRIME WITHOUT A UEI',
      subcontracts: 16,
      amount: 2_400_000,
      subcontractors: 6,
      serviceShare: 0.5,
      obligations: null,
      topSubcontractors: [],
    }),
  ],
  provenance: provenanceOf({
    requests: 32,
    disclosures: ['Primes report first-tier subcontracts only.'],
  }),
  ...overrides,
});

export const awardBodyOf = (overrides: Partial<AwardBody> = {}): AwardBody => ({
  externalId: 'CONT_AWD_89303019FET000003_8900_89303019AET000001_8900',
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
  orders: null,
  obligated: 44_095_065.78,
  exercised: 45_969_821.2,
  ceiling: 46_119_821.2,
  signedAt: '2019-09-27',
  startsAt: '2019-09-27',
  endsAt: '2026-12-26',
  endsWithOptionsAt: '2027-12-26',
  naicsCode: '541511',
  naicsDescription: 'CUSTOM COMPUTER PROGRAMMING SERVICES',
  pscCode: 'D310',
  pscDescription: 'IT AND TELECOM- CYBER SECURITY AND DATA BACKUP',
  placeOfPerformance: 'WASHINGTON, DC',
  competition: {
    offers: 3,
    setAsideCode: 'NONE',
    setAside: 'NO SET ASIDE USED.',
    extentCompeted: 'FULL AND OPEN COMPETITION',
    solicitationProcedures: 'SUBJECT TO MULTIPLE AWARD FAIR OPPORTUNITY',
    pricing: 'TIME AND MATERIALS',
    solicitationId: null,
  },
  subcontractingPlan: { code: 'F', description: 'INDIVIDUAL SUBCONTRACT PLAN' },
  subcontractCount: 7,
  subcontractAmount: 30_993_310.09,
  subcontracts: [
    {
      id: '10747444',
      name: 'CLEARFOCUS TECHNOLOGIES LLC',
      amount: 15_300_000,
      actionDate: '2020-02-25',
      description: 'CYBERSECURITY SERVICES',
    },
    {
      id: '10656892',
      name: 'KFORCE INC.',
      amount: 6_000_000,
      actionDate: '2023-04-21',
      description: 'COMMERCIAL STAFFING SERVICES.',
    },
  ],
  ...overrides,
});

export const awardDetailOf = (overrides: Partial<AwardDetail> = {}): AwardDetail => ({
  ...awardBodyOf(),
  openNotices: [],
  provenance: provenanceOf({ requests: 2 }),
  ...overrides,
});
