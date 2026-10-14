import type { AwardBody } from './award-detail';

/**
 * A wire-shaped builder for one award's record, taking overrides. The story
 * is one order under a single-award vehicle at the Department of Energy,
 * held by a large prime that reports its subcontracts.
 */
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
