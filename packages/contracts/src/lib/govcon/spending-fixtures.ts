import { NO_FACETS, NO_SET_ASIDE } from './facets';
import { FISCAL_PERIODS } from './fiscal';
import { opportunityOf } from './fixtures';
import {
  noticeRefOf,
  type AgencyDirectory,
  type AgencyDirectoryEntry,
  type AgencyOutlook,
  type HorizonRow,
  type PeriodObligations,
  type ProjectedPeriod,
  type PublicationDelay,
  type Provenance,
  type SpendingBreakdown,
  type SpendingHorizon,
  type SpendingPulse,
  type SpendingReach,
  type SpendingScope,
} from './spending';

/**
 * Wire-shaped builders for the spending lenses, one per answer, each taking
 * overrides. The story is one scope — machine shops (NAICS 332710), every
 * agency, both award families — read on 2026-06-15, period 9 of FY2026, with
 * FY2023–2025 complete behind it. Amounts are deterministic arithmetic, so a
 * story and a spec start from the same numbers.
 */
export const spendingScopeOf = (overrides: Partial<SpendingScope> = {}): SpendingScope => ({
  naics: ['332710'],
  psc: [],
  agency: null,
  awardFamily: 'both',
  facets: NO_FACETS,
  ...overrides,
});

export const provenanceOf = (overrides: Partial<Provenance> = {}): Provenance => ({
  source: 'usaspending',
  fetchedAt: '2026-06-15T13:00:00.000Z',
  asOf: '2026-06-14',
  servedFrom: 'snapshot',
  requests: 1,
  disclosures: ['Department of Defense awards are published 90 days after they are signed.'],
  ...overrides,
});

/** Twelve periods of a fiscal year (or the first `upTo`), rising through the year, scaled by `factor`; the last one partial when asked. */
export const periodsOf = (
  fiscalYear: number,
  upTo = FISCAL_PERIODS,
  factor = 1,
  partialLast = false,
): PeriodObligations[] =>
  Array.from({ length: upTo }, (_, index) => {
    const period = index + 1;
    const contracts = Math.round(400_000 * (1 + period / 6) * factor);
    const idvs = Math.round(60_000 * factor);
    return {
      fiscalYear,
      period,
      contracts,
      idvs,
      total: contracts + idvs,
      partial: partialLast && period === upTo,
      unpublished: false,
    };
  });

/** One agency publishing 90 days late, read on 2026-06-15: everything through mid-March is in. */
export const publicationDelayOf = (
  overrides: Partial<PublicationDelay> = {},
): PublicationDelay => ({
  agencies: ['Department of Defense'],
  days: 90,
  completeThrough: '2026-03-16',
  ...overrides,
});

/** One projected period of the story: the three prior years' mean, scaled 1.1× with its band. */
export const projectedPeriodOf = (fiscalYear: number, period: number): ProjectedPeriod => {
  const expected = Math.round(400_000 * (1 + period / 6) * 0.9 + 60_000 * 0.9);
  return {
    fiscalYear,
    period,
    expected,
    scaled: Math.round(expected * 1.1),
    low: Math.round(expected * 0.8),
    high: Math.round(expected * 1.15),
  };
};

export const spendingPulseOf = (overrides: Partial<SpendingPulse> = {}): SpendingPulse => ({
  scope: spendingScopeOf(),
  fiscalYear: 2026,
  series: [
    ...periodsOf(2023, FISCAL_PERIODS, 0.8),
    ...periodsOf(2024, FISCAL_PERIODS, 0.9),
    ...periodsOf(2025),
    ...periodsOf(2026, 9, 1.1, true),
  ],
  projection: {
    method: 'seasonal-mean',
    lookbackFiscalYears: [2023, 2024, 2025],
    basePeriods: 8,
    ratio: 1.1,
    periods: [9, 10, 11, 12].map((period) => projectedPeriodOf(2026, period)),
  },
  delay: null,
  provenance: provenanceOf(),
  ...overrides,
});

export const spendingBreakdownOf = (
  overrides: Partial<SpendingBreakdown> = {},
): SpendingBreakdown => ({
  scope: spendingScopeOf(),
  category: 'awarding_agency',
  from: '2025-10-01',
  to: '2026-06-15',
  total: 8_000_000,
  rows: [
    { id: '1173', code: 'DOD', name: 'Department of Defense', amount: 6_200_000, share: 0.775 },
    {
      id: '862',
      code: 'NASA',
      name: 'National Aeronautics and Space Administration',
      amount: 900_000,
      share: 0.1125,
    },
    { id: '315', code: 'DOS', name: 'Department of State', amount: 500_000, share: 0.0625 },
    { id: '95', code: 'USDA', name: 'Department of Agriculture', amount: 260_000, share: 0.0325 },
    { id: '209', code: 'DOI', name: 'Department of the Interior', amount: 140_000, share: 0.0175 },
  ],
  truncated: false,
  delay: null,
  provenance: provenanceOf(),
  ...overrides,
});

/** The story's lanes: open competition and the two small-business set-asides. */
const LANES = [NO_SET_ASIDE, 'SBA', 'SBP'];

/** A year of new contracts cut down to the ones a small firm with those lanes won without a vehicle. */
export const spendingReachOf = (overrides: Partial<SpendingReach> = {}): SpendingReach => {
  const fresh = { ...NO_FACETS, newOnly: true };
  const inLanes = { ...fresh, setAside: LANES };
  const standalone = { ...inLanes, placement: 'standalone' as const };
  return {
    scope: spendingScopeOf({ awardFamily: 'contracts' }),
    from: '2025-06-16',
    to: '2026-06-15',
    lanes: LANES,
    cuts: [
      { id: 'new', facets: fresh, awards: 4_800, amount: 96_000_000 },
      { id: 'lanes', facets: inLanes, awards: 3_100, amount: 52_000_000 },
      { id: 'standalone', facets: standalone, awards: 620, amount: 21_000_000 },
      {
        id: 'small',
        facets: { ...standalone, recipientSize: 'small' },
        awards: 410,
        amount: 9_500_000,
      },
    ],
    bands: [
      { id: 'micro', awards: 150 },
      { id: 'simplified', awards: 205 },
      { id: 'mid', awards: 40 },
      { id: 'large', awards: 15 },
    ],
    delay: null,
    provenance: provenanceOf({ requests: 12 }),
    ...overrides,
  };
};

export const horizonRowOf = (overrides: Partial<HorizonRow> = {}): HorizonRow => ({
  externalId: 'CONT_AWD_N6660426P0205_9700_-NONE-_-NONE-',
  piid: 'N6660426P0205',
  family: 'contracts',
  typeDescription: 'PURCHASE ORDER',
  recipientName: 'VIRGINIA HIGHLANDS MACHINE INC.',
  recipientUei: 'DMDXQNBUKXV5',
  amount: 266_963.4,
  endsAt: '2026-07-20',
  agencyPath: 'Department of Defense.Department of the Navy',
  agencyCode: '097.1700',
  naicsCode: '332710',
  pscCode: '5340',
  description: 'Housing and end-plate components for underwater sonar.',
  ...overrides,
});

export const spendingHorizonOf = (overrides: Partial<SpendingHorizon> = {}): SpendingHorizon => ({
  scope: spendingScopeOf(),
  today: '2026-06-15',
  months: 12,
  buckets: Array.from({ length: 12 }, (_, index) => {
    const month = ((5 + index) % 12) + 1;
    const year = 5 + index >= 12 ? 2027 : 2026;
    return {
      year,
      month,
      contracts: { count: 6 - (index % 4), amount: 900_000 - index * 50_000 },
      idvs: { count: index % 3, amount: 0 },
    };
  }),
  rows: [
    horizonRowOf(),
    horizonRowOf({
      externalId: 'CONT_IDV_70Z08026D16007B00_7008',
      piid: '70Z08026D16007B00',
      family: 'idvs',
      typeDescription: 'INDEFINITE DELIVERY / INDEFINITE QUANTITY',
      recipientName: 'DAMCO, INC',
      recipientUei: null,
      amount: 0,
      endsAt: '2026-09-14',
      agencyPath: 'Department of Homeland Security.U.S. Coast Guard',
      agencyCode: '070.7008',
      pscCode: '2040',
      description: 'Marine hardware and hull items.',
    }),
  ],
  capped: false,
  stoppedBy: null,
  completeBefore: null,
  // The DLA bracket solicitation shares the first row's NAICS and buyer: one recompete in view.
  openNotices: [
    {
      externalId: horizonRowOf().externalId,
      notices: [noticeRefOf(opportunityOf({ agencyCode: '097.1700.N00104' }))],
    },
  ],
  openNoticesCapped: false,
  provenance: provenanceOf({ requests: 7 }),
  ...overrides,
});

export const agencyDirectoryEntryOf = (
  overrides: Partial<AgencyDirectoryEntry> = {},
): AgencyDirectoryEntry => ({
  agencyId: 1173,
  toptierCode: '097',
  abbreviation: 'DOD',
  name: 'Department of Defense',
  budgetAuthority: 1_300_000_000_000,
  obligated: 980_000_000_000,
  outlayed: 870_000_000_000,
  activeFiscalYear: 2026,
  activeQuarter: 3,
  ...overrides,
});

export const agencyDirectoryOf = (overrides: Partial<AgencyDirectory> = {}): AgencyDirectory => ({
  entries: [
    agencyDirectoryEntryOf(),
    agencyDirectoryEntryOf({
      agencyId: 561,
      toptierCode: '036',
      abbreviation: 'VA',
      name: 'Department of Veterans Affairs',
      budgetAuthority: 420_000_000_000,
      obligated: 310_000_000_000,
      outlayed: 300_000_000_000,
    }),
    agencyDirectoryEntryOf({
      agencyId: 766,
      toptierCode: '070',
      abbreviation: 'DHS',
      name: 'Department of Homeland Security',
      budgetAuthority: 180_000_000_000,
      obligated: 120_000_000_000,
      outlayed: 110_000_000_000,
    }),
  ],
  provenance: provenanceOf({ asOf: null }),
  ...overrides,
});

export const agencyOutlookOf = (overrides: Partial<AgencyOutlook> = {}): AgencyOutlook => ({
  toptierCode: '097',
  name: 'Department of Defense',
  abbreviation: 'DOD',
  years: [2026, 2025, 2024, 2023].map((fiscalYear, index) => {
    const periods = fiscalYear === 2026 ? 8 : 11;
    return {
      fiscalYear,
      budgetaryResources: 1_300_000_000_000 - index * 40_000_000_000,
      obligated: (fiscalYear === 2026 ? 640 : 980) * 1_000_000_000,
      outlayed: (fiscalYear === 2026 ? 560 : 870) * 1_000_000_000,
      byPeriod: Array.from({ length: periods }, (_, at) => ({
        period: at + 2,
        obligated: (70 + at * 4) * 1_000_000_000,
      })),
    };
  }),
  officesFiscalYear: 2026,
  awardFamily: 'both',
  subAgencies: [
    {
      code: null,
      name: 'Department of the Navy',
      abbreviation: 'USN',
      obligations: 121_000_000_000,
      transactions: 119_558,
      newAwards: 37_352,
      offices: [
        {
          code: 'N00024',
          name: 'NAVSEA HQ',
          obligations: 37_000_000_000,
          transactions: 4_205,
          newAwards: 999,
        },
        {
          code: 'N00019',
          name: 'NAVAL AIR SYSTEMS COMMAND',
          obligations: 33_000_000_000,
          transactions: 3_028,
          newAwards: 313,
        },
      ],
    },
    {
      code: null,
      name: 'Defense Logistics Agency',
      abbreviation: 'DLA',
      obligations: 48_000_000_000,
      transactions: 1_200_000,
      newAwards: 640_000,
      offices: [
        {
          code: 'SPE4A7',
          name: 'DLA AVIATION',
          obligations: 9_000_000_000,
          transactions: 300_000,
          newAwards: 150_000,
        },
      ],
    },
  ],
  truncated: false,
  provenance: provenanceOf({ requests: 2 }),
  ...overrides,
});
