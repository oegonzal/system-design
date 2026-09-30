import {
  descriptionOf,
  leadOf,
  noticeOf,
  opportunityOf,
  profileOf,
  pullReportOf,
  sliceReportOf,
  sourceCallOf,
  sourceStatusOf,
  type Description,
  type Lead,
  type LeadsReport,
  type NoticeDto,
  type Opportunity,
  type PullReport,
  type SearchProfile,
  type SourceCall,
  type SourceStatus,
} from '@sysdesign/contracts';

/**
 * The client's story: Enfav's profile and a NAVSUP repair solicitation, built
 * over the contracts' builders so every spec and story here starts from the
 * same wire-shaped facts. ISO stamps are fixed so renders never drift.
 */
export const PROFILE: SearchProfile = profileOf({
  id: 'enfav',
  company: 'Enfav LLC',
  naics: ['332710', '333249', '541511', '541512'],
  psc: ['53', '59', 'DA', '7030'],
  interests: [
    { term: 'additive manufacturing', aliases: ['3d printing', '3d printed'], weight: 0.6 },
    { term: 'replacement parts', aliases: ['spare parts', 'repair parts'], weight: 0.5 },
    { term: 'software development', aliases: ['software', 'custom software'], weight: 0.5 },
  ],
  pull: {
    slices: [{ naics: '332710' }, { naics: '333249' }, { naics: '541511' }, { naics: '541512' }],
    pageSize: 1000,
    maxPagesPerSlice: 1,
  },
  scoring: {
    ...profileOf().scoring,
    noticeType: {
      byType: { Solicitation: 1, 'Combined Synopsis/Solicitation': 1, 'Sources Sought': 0.7 },
      default: 0.2,
      exclude: ['Award Notice', 'Justification'],
    },
  },
});

export const SOURCE_STATUS: SourceStatus = sourceStatusOf({
  budget: { spent: 3, limit: 10, windowHours: 24 },
});

export const DISABLED_SOURCE: SourceStatus = sourceStatusOf({
  availability: { enabled: false, reason: 'no-key' },
  budget: { spent: 0, limit: 10, windowHours: 24 },
});

export const makeOpportunity = (overrides: Partial<Opportunity> = {}): Opportunity =>
  opportunityOf({
    noticeId: '21b781192a4f4026a2946237984a9c06',
    title: '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF',
    solicitationNumber: 'N0010426QFG43',
    agencyPath: 'DEPT OF DEFENSE.DEPT OF THE NAVY.NAVSUP.NAVSUP WEAPON SYSTEMS SUPPORT',
    agencyCode: '097.1700.N00104',
    postedAt: '2026-09-25T00:00:00.000Z',
    responseDeadlineAt: '2026-10-26T20:30:00.000Z',
    classificationCode: '5975',
    setAsideCode: null,
    setAsideDescription: null,
    placeOfPerformance: { city: 'Mechanicsburg', state: 'PA', zip: '17050', country: 'USA' },
    officeAddress: { city: 'MECHANICSBURG', state: 'PA', zip: '17050', countryCode: 'USA' },
    pointsOfContact: [
      {
        type: 'primary',
        title: null,
        fullName: 'Noelle Smith',
        email: 'noelle.smith@navy.example',
        phone: '717-605-3992',
      },
    ],
    descriptionUrl:
      'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=21b781192a4f4026a2946237984a9c06',
    uiLink: 'https://sam.gov/workspace/contract/opp/21b781192a4f4026a2946237984a9c06/view',
    ...overrides,
  });

export const makeLead = (overrides: Partial<Lead> = {}): Lead =>
  leadOf({
    opportunity: makeOpportunity(),
    score: 71.5,
    tier: 'high',
    factors: [
      { id: 'naics', value: 1, weight: 0.3, points: 30, evidence: ['naics 332710'] },
      { id: 'psc', value: 0.5, weight: 0.15, points: 7.5, evidence: ['psc 5975 in family 59'] },
      {
        id: 'interests',
        value: 0.3,
        weight: 0.15,
        points: 4.5,
        evidence: ['maintenance (as "repair")'],
      },
      { id: 'setAside', value: 0.5, weight: 0.15, points: 7.5, evidence: ['unrestricted'] },
      {
        id: 'noticeType',
        value: 1,
        weight: 0.1,
        points: 10,
        evidence: ['notice type Solicitation'],
      },
      { id: 'deadline', value: 0.8, weight: 0.15, points: 12, evidence: ['30 day(s) to respond'] },
    ],
    ...overrides,
  });

/** High, medium, low — the order a ranking would put them in. */
export const LEADS: Lead[] = [
  makeLead(),
  makeLead({
    opportunity: makeOpportunity({
      noticeId: 'a82be74dbc744767aae22bcb273c223f',
      title: 'NRP,HANDSET ASSEMBL',
      solicitationNumber: 'SPE4A726T1234',
      agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION AT PHILADELPHIA',
      classificationCode: '4920',
      uiLink: 'https://sam.gov/workspace/contract/opp/a82be74dbc744767aae22bcb273c223f/view',
    }),
    score: 59.5,
    tier: 'medium',
    factors: [
      { id: 'naics', value: 1, weight: 0.3, points: 30, evidence: ['naics 332710'] },
      { id: 'psc', value: 0, weight: 0.15, points: 0, evidence: ['no psc family matched'] },
      { id: 'interests', value: 0, weight: 0.15, points: 0, evidence: ['no interest matched'] },
      { id: 'setAside', value: 0.5, weight: 0.15, points: 7.5, evidence: ['unrestricted'] },
      {
        id: 'noticeType',
        value: 1,
        weight: 0.1,
        points: 10,
        evidence: ['notice type Solicitation'],
      },
      { id: 'deadline', value: 0.8, weight: 0.15, points: 12, evidence: ['30 day(s) to respond'] },
    ],
  }),
  makeLead({
    opportunity: makeOpportunity({
      noticeId: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
      title: 'Sources Sought: Custom Software Development Services',
      solicitationNumber: 'W912DY26R0042',
      agencyPath: 'DEPT OF DEFENSE.DEPT OF THE ARMY.AMC.ACC.ACC-RSA',
      noticeType: 'Sources Sought',
      naicsCode: '541511',
      naicsCodes: ['541511'],
      classificationCode: 'DA01',
      setAsideCode: 'SBA',
      setAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
      responseDeadlineAt: null,
      uiLink: 'https://sam.gov/workspace/contract/opp/0f1e2d3c4b5a69788796a5b4c3d2e1f0/view',
    }),
    score: 32,
    tier: 'low',
    factors: [
      {
        id: 'naics',
        value: 0.33,
        weight: 0.3,
        points: 10,
        evidence: ['naics 541511 in family 54'],
      },
      { id: 'psc', value: 0.25, weight: 0.15, points: 3.8, evidence: ['psc DA01 in family D'] },
      {
        id: 'interests',
        value: 0.5,
        weight: 0.15,
        points: 7.5,
        evidence: ['software development (as "software")'],
      },
      { id: 'setAside', value: 0, weight: 0.15, points: 0, evidence: ['set-aside SBA'] },
      {
        id: 'noticeType',
        value: 0.7,
        weight: 0.1,
        points: 7,
        evidence: ['notice type Sources Sought'],
      },
      { id: 'deadline', value: 0.4, weight: 0.15, points: 6, evidence: ['no deadline stated'] },
    ],
  }),
];

export const EXCLUDED_LEAD: Lead = makeLead({
  opportunity: makeOpportunity({
    noticeId: 'ffeeddccbbaa99887766554433221100',
    setAsideCode: 'HZC',
  }),
  score: 0,
  tier: null,
  excluded: { factor: 'setAside', reason: 'ineligible set-aside HZC' },
});

export const makeLeadsReport = (overrides: Partial<LeadsReport> = {}): LeadsReport => ({
  profile: 'enfav',
  candidates: 4,
  capped: false,
  excluded: 1,
  matching: 3,
  leads: LEADS,
  limit: 25,
  offset: 0,
  ...overrides,
});

export const DESCRIPTION: Description = descriptionOf();

export const makeLeadDetail = (overrides: Partial<NoticeDto> = {}): NoticeDto =>
  noticeOf({ ...makeLead(), description: null, ...overrides });

const slice = (naics: string, overrides: Partial<ReturnType<typeof sliceReportOf>> = {}) =>
  sliceReportOf({
    query: { postedFrom: '2026-09-24', postedTo: '2026-09-26', limit: 1000, offset: 0, naics },
    ...overrides,
  });

export const makePullReport = (overrides: Partial<PullReport> = {}): PullReport =>
  pullReportOf({
    profile: 'enfav',
    slices: [
      slice('332710'),
      slice('333249', {
        outcome: 'cached',
        pages: 0,
        received: 0,
        inserted: 0,
        detail: 'pulled 2026-09-26T19:10:37.782Z, 0 record(s)',
      }),
      slice('541511', {
        outcome: 'budget-exhausted',
        pages: 0,
        received: 0,
        inserted: 0,
        detail: 'budget 3/3 spent',
      }),
      slice('541512', {
        outcome: 'skipped',
        pages: 0,
        received: 0,
        inserted: 0,
        detail: 'stopped earlier: budget',
      }),
    ],
    spent: 3,
    budget: 3,
    stoppedBy: 'budget',
    ...overrides,
  });

export const CALLS: SourceCall[] = [
  sourceCallOf({
    id: 'c3',
    operation: 'description',
    queryKey: 'd'.repeat(64),
    query: { noticeId: '21b781192a4f4026a2946237984a9c06' },
    requestedAt: '2026-09-27T02:57:23.527Z',
    durationMs: 640,
    totalRecords: null,
    recordCount: 1,
  }),
  sourceCallOf({
    id: 'c2',
    queryKey: 'b'.repeat(64),
    query: {
      postedFrom: '2026-09-25',
      postedTo: '2026-09-27',
      limit: 1000,
      offset: 0,
      naics: '333249',
    },
    requestedAt: '2026-09-27T02:10:37.782Z',
    durationMs: 181,
    totalRecords: 0,
    recordCount: 0,
  }),
  sourceCallOf({ id: 'c1' }),
];
