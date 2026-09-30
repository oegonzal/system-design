import type { Award, AwardsSummary } from './award';
import type { Bid, PipelineRow, BidPipelineSummary } from './bid';
import type { Entity } from './entity';
import type { Lead, LeadsReport } from './lead';
import type { NoticeDto } from './notice';
import type { Opportunity } from './opportunity';
import type { SearchProfile, StoredProfile } from './profile';
import type { PullReport, SliceReport } from './pull';
import type { SavedSearch } from './search';
import type { Description, SourceCall, SourceStatus } from './source';

/**
 * Wire-shaped builders for specs and stories, one per record, each taking
 * overrides. The defaults are one coherent story — a DLA bracket solicitation
 * scored by a small profile — so a spec anywhere in the repo (the govcon
 * core, the client's stories) starts from the same facts and states only
 * what it changes. ISO stamps are fixed so nothing rendered ever drifts.
 */
export const opportunityOf = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  noticeId: 'n-1',
  title: 'Additive manufacturing of replacement brackets',
  solicitationNumber: 'SPE4A7-26-Q-0001',
  agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION',
  agencyCode: '097.97AS.SPE4A7',
  postedAt: '2026-09-20T00:00:00.000Z',
  responseDeadlineAt: '2026-10-10T12:00:00.000Z',
  archiveAt: null,
  archiveType: 'auto15',
  noticeType: 'Solicitation',
  baseType: 'Solicitation',
  active: true,
  naicsCode: '332710',
  naicsCodes: ['332710'],
  classificationCode: '5340',
  setAsideCode: 'SBA',
  setAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
  organizationType: 'OFFICE',
  placeOfPerformance: { city: 'Richmond', state: 'VA', zip: '23297', country: 'USA' },
  officeAddress: { city: 'RICHMOND', state: 'VA', zip: '23297', countryCode: 'USA' },
  pointsOfContact: [
    { type: 'primary', title: null, fullName: 'A. Buyer', email: 'a.buyer@dla.mil', phone: null },
  ],
  descriptionUrl: 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=n-1',
  uiLink: 'https://sam.gov/opp/n-1/view',
  additionalInfoLink: null,
  resourceLinks: [],
  award: null,
  source: 'sam.gov',
  ...overrides,
});

/** A small profile every factor can price; its weights name exactly the scorer's factors. */
export const profileOf = (overrides: Partial<SearchProfile> = {}): SearchProfile => ({
  id: 'tiny',
  company: 'Tiny LLC',
  entityUei: null,
  naics: ['332710', '5415'],
  psc: ['53', 'D3'],
  interests: [
    { term: 'additive manufacturing', aliases: ['3d printing'], weight: 0.6 },
    { term: 'replacement parts', aliases: ['replacement brackets'], weight: 0.5 },
  ],
  pull: { pageSize: 100, maxPagesPerSlice: 1 },
  leads: { horizonDays: 120 },
  scoring: {
    weights: {
      naics: 0.3,
      psc: 0.15,
      interests: 0.15,
      setAside: 0.15,
      noticeType: 0.1,
      deadline: 0.15,
      history: 0,
      freshness: 0,
    },
    setAside: { byCode: { SBA: 1, SBP: 0.8 }, unrestricted: 0.5 },
    noticeType: {
      byType: { Solicitation: 1, 'Sources Sought': 0.7 },
      default: 0.2,
      exclude: ['Award Notice'],
    },
    deadline: {
      bands: [
        { maxDays: 3, value: 0.3 },
        { maxDays: 14, value: 1 },
        { maxDays: 45, value: 0.8 },
      ],
      beyond: 0.6,
      none: 0.4,
    },
    history: { days: 365, saturateAt: 5 },
    freshness: {
      bands: [
        { maxDays: 3, value: 1 },
        { maxDays: 14, value: 0.7 },
      ],
      beyond: 0.4,
    },
    tiers: { high: 70, medium: 45 },
  },
  ...overrides,
});

export const storedProfileOf = (overrides: Partial<StoredProfile> = {}): StoredProfile => ({
  ...profileOf(),
  isDefault: true,
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  ...overrides,
});

/** `opportunityOf()` scored by `profileOf()` twenty days before its deadline. */
export const leadOf = (overrides: Partial<Lead> = {}): Lead => ({
  opportunity: opportunityOf(),
  score: 89.5,
  tier: 'high',
  factors: [
    { id: 'naics', value: 1, weight: 0.3, points: 30, evidence: ['naics 332710'] },
    { id: 'psc', value: 0.5, weight: 0.15, points: 7.5, evidence: ['psc 5340 in family 53'] },
    {
      id: 'interests',
      value: 1,
      weight: 0.15,
      points: 15,
      evidence: ['additive manufacturing', 'replacement parts (as "replacement brackets")'],
    },
    { id: 'setAside', value: 1, weight: 0.15, points: 15, evidence: ['set-aside SBA'] },
    { id: 'noticeType', value: 1, weight: 0.1, points: 10, evidence: ['notice type Solicitation'] },
    { id: 'deadline', value: 0.8, weight: 0.15, points: 12, evidence: ['20 day(s) to respond'] },
    {
      id: 'history',
      value: 0,
      weight: 0,
      points: 0,
      evidence: ['no stored award in naics 332710'],
    },
    { id: 'freshness', value: 0.7, weight: 0, points: 0, evidence: ['posted 6 day(s) ago'] },
  ],
  excluded: null,
  ...overrides,
});

export const leadsReportOf = (overrides: Partial<LeadsReport> = {}): LeadsReport => ({
  profile: 'tiny',
  candidates: 1,
  capped: false,
  excluded: 0,
  matching: 1,
  leads: [leadOf()],
  limit: 25,
  offset: 0,
  ...overrides,
});

export const descriptionOf = (overrides: Partial<Description> = {}): Description => ({
  text: 'The Defense Logistics Agency intends to purchase 400 each of NSN 5340-01-123-4567, bracket, mounting, additively manufactured to drawing 12345678 rev C.\nDelivery: 90 days ARO\nQuestions to A. Buyer — a.buyer@dla.mil — by 10/03/2026.',
  fetchedAt: '2026-09-27T02:57:23.527Z',
  ...overrides,
});

export const noticeOf = (overrides: Partial<NoticeDto> = {}): NoticeDto => ({
  ...leadOf(),
  description: null,
  attachments: [],
  bid: null,
  ...overrides,
});

export const sliceReportOf = (overrides: Partial<SliceReport> = {}): SliceReport => ({
  name: null,
  query: {
    postedFrom: '2026-09-24',
    postedTo: '2026-09-26',
    limit: 1000,
    offset: 0,
    naics: '332710',
  },
  outcome: 'ok',
  pages: 1,
  received: 2,
  inserted: 2,
  updated: 0,
  rejected: 0,
  truncated: false,
  detail: null,
  ...overrides,
});

export const pullReportOf = (overrides: Partial<PullReport> = {}): PullReport => ({
  profile: 'tiny',
  window: { from: '2026-09-24', to: '2026-09-26' },
  source: { id: 'sam.gov', availability: { enabled: true, reason: null } },
  slices: [sliceReportOf()],
  spent: 1,
  budget: 1000,
  stoppedBy: null,
  ...overrides,
});

export const sourceStatusOf = (overrides: Partial<SourceStatus> = {}): SourceStatus => ({
  id: 'sam.gov',
  availability: { enabled: true, reason: null },
  budget: { spent: 3, limit: 1000, windowHours: 24 },
  cacheTtlHours: 24,
  ...overrides,
});

export const sourceCallOf = (overrides: Partial<SourceCall> = {}): SourceCall =>
  ({
    id: 'c1',
    source: 'sam.gov',
    operation: 'search',
    attempt: 1,
    queryKey: 'a'.repeat(64),
    query: {
      postedFrom: '2026-09-25',
      postedTo: '2026-09-27',
      limit: 1000,
      offset: 0,
      naics: '332710',
    },
    requestedAt: '2026-09-27T02:10:36.823Z',
    durationMs: 931,
    status: 200,
    outcome: 'ok',
    totalRecords: 2,
    recordCount: 2,
    error: null,
    ...overrides,
  }) as SourceCall;

export const savedSearchOf = (overrides: Partial<SavedSearch> = {}): SavedSearch => ({
  id: 's-1',
  profileId: 'tiny',
  name: 'Machine shops',
  filter: { naics: '332710', status: 'active' },
  days: 3,
  includedInPull: true,
  pullOrder: 0,
  lastRunAt: null,
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  ...overrides,
});

export const bidOf = (overrides: Partial<Bid> = {}): Bid => ({
  noticeId: 'n-1',
  stage: 'qualifying',
  notes: 'Ask for drawing 12345678 rev C before quoting.',
  reminderAt: '2026-10-03T16:00:00.000Z',
  estimatedValue: 48000,
  stageChangedAt: '2026-09-27T03:00:00.000Z',
  createdAt: '2026-09-27T03:00:00.000Z',
  updatedAt: '2026-09-27T03:00:00.000Z',
  ...overrides,
});

export const pipelineRowOf = (overrides: Partial<PipelineRow> = {}): PipelineRow => ({
  bid: bidOf(),
  lead: leadOf(),
  ...overrides,
});

export const bidPipelineSummaryOf = (
  overrides: Partial<BidPipelineSummary> = {},
): BidPipelineSummary => ({
  byStage: { watching: 2, qualifying: 1, preparing: 0, submitted: 1, won: 0, lost: 0, passed: 1 },
  dueSoon: 1,
  total: 5,
  ...overrides,
});

export const awardOf = (overrides: Partial<Award> = {}): Award => ({
  source: 'sam.gov',
  externalId: 'SPE4A726P0123',
  solicitationNumber: 'SPE4A7-26-Q-0001',
  naicsCode: '332710',
  pscCode: '5340',
  agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION',
  agencyCode: '097.97AS.SPE4A7',
  awardeeName: 'PRECISION PARTS CO',
  awardeeUei: 'ABC123DEF456',
  amount: 52000,
  offersReceived: 3,
  extentCompeted: 'D',
  setAsideCode: 'SBA',
  signedAt: '2026-06-12',
  completionAt: '2026-09-30',
  placeOfPerformance: { city: 'Richmond', state: 'VA', zip: '23297', country: 'USA' },
  fetchedAt: '2026-09-27T04:00:00.000Z',
  ...overrides,
});

export const awardsSummaryOf = (overrides: Partial<AwardsSummary> = {}): AwardsSummary => ({
  count: 3,
  total: 156000,
  median: 52000,
  offers: { one: 1, few: 2, many: 0, unknown: 0 },
  topAwardees: [{ name: 'PRECISION PARTS CO', uei: 'ABC123DEF456', count: 2, total: 104000 }],
  setAsideMix: { SBA: 2, open: 1 },
  bySource: { 'sam.gov': 3, usaspending: 0 },
  ...overrides,
});

export const entityOf = (overrides: Partial<Entity> = {}): Entity => ({
  uei: 'ABC123DEF456',
  cage: '1AB23',
  legalName: 'PRECISION PARTS CO',
  registrationStatus: 'Active',
  registrationExpiresAt: '2027-03-01',
  businessTypes: ['2X', 'XS'],
  sbaCertifications: [],
  naics: [{ code: '332710', small: true }],
  psc: ['5340'],
  parentUei: null,
  parentName: null,
  excluded: false,
  exclusionCheckedAt: '2026-09-27T04:05:00.000Z',
  fetchedAt: '2026-09-27T04:05:00.000Z',
  ...overrides,
});
