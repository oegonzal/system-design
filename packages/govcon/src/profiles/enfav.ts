import type { QueryFilter, SearchProfile } from '@sysdesign/contracts';

/**
 * Enfav LLC: a small business (total small business set-asides and open
 * competition; no 8(a), HUBZone, veteran or women-owned status) working across
 * two families — parts and additive manufacturing on one side, software,
 * automation and data on the other. Everything below is data the scorer and
 * the pull read; it seeds the store once and is edited there afterwards.
 */
export const ENFAV = {
  id: 'enfav',
  company: 'Enfav LLC',
  entityUei: null,
  naics: [
    // Manufacturing and parts.
    '332710', // machine shops
    '333249', // other industrial machinery manufacturing
    '326199', // all other plastics product manufacturing
    '339999', // all other miscellaneous manufacturing
    // Software, automation and data.
    '541511', // custom computer programming services
    '541512', // computer systems design services
    '541519', // other computer related services
    '518210', // computing infrastructure, data processing, hosting
  ],
  psc: [
    '7030', // information technology software
    'D3', // IT and telecom services (legacy series)
    'DA', // IT and telecom: business application / application development
    'DB', // IT and telecom: compute
    'DF', // IT and telecom: IT management / support
    'DG', // IT and telecom: network
    'J0', // maintenance, repair and rebuilding of equipment
    '59', // electrical and electronic equipment components
    '53', // hardware and abrasives
    '34', // metalworking machinery
  ],
  interests: [
    {
      term: 'additive manufacturing',
      aliases: ['3d printing', '3d printed', '3 d printing', 'additively manufactured'],
      weight: 0.6,
    },
    { term: 'rapid prototyping', aliases: ['prototype', 'prototyping'], weight: 0.4 },
    {
      term: 'replacement parts',
      aliases: ['spare parts', 'repair parts', 'replacement part', 'spare part'],
      weight: 0.5,
    },
    {
      term: 'reverse engineering',
      aliases: ['reverse engineer', 'reverse engineered'],
      weight: 0.5,
    },
    {
      term: 'automation',
      aliases: ['workflow automation', 'process automation', 'automated'],
      weight: 0.4,
    },
    {
      term: 'artificial intelligence',
      aliases: ['machine learning', 'ai', 'ml', 'llm', 'generative'],
      weight: 0.5,
    },
    {
      term: 'data processing',
      aliases: ['data pipeline', 'data integration', 'etl', 'data platform'],
      weight: 0.4,
    },
    {
      term: 'software development',
      aliases: ['software', 'custom software', 'application development', 'web application'],
      weight: 0.5,
    },
    { term: 'maintenance', aliases: ['repair', 'sustainment', 'overhaul'], weight: 0.3 },
    { term: 'inventory management', aliases: ['inventory', 'supply chain'], weight: 0.3 },
  ],
  pull: { pageSize: 1000, maxPagesPerSlice: 1 },
  leads: { horizonDays: 120 },
  // The daily digest: awards in these codes ending within a quarter, and a month running above every prior year's.
  alerts: { endingWithinDays: 90, pulseAboveBand: true },
  // The subcontracts a firm this size could take: a prime is ranked by how many of these it reports.
  teaming: { subcontract: { min: 50_000, max: 2_000_000 } },
  scoring: {
    weights: {
      naics: 0.3,
      psc: 0.15,
      interests: 0.15,
      setAside: 0.15,
      noticeType: 0.1,
      deadline: 0.15,
      // Priced at nothing until enough awards are stored to mean something; the trace still shows them.
      history: 0,
      freshness: 0,
    },
    setAside: { byCode: { SBA: 1, SBP: 0.8 }, unrestricted: 0.5 },
    noticeType: {
      byType: {
        Solicitation: 1,
        'Combined Synopsis/Solicitation': 1,
        Presolicitation: 0.8,
        'Sources Sought': 0.7,
        'Special Notice': 0.3,
      },
      default: 0.2,
      exclude: ['Award Notice', 'Justification', 'Sale of Surplus Property'],
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
        { maxDays: 45, value: 0.4 },
      ],
      beyond: 0.2,
    },
    tiers: { high: 70, medium: 45 },
  },
} satisfies SearchProfile;

/**
 * The seed's saved searches: one six-digit NAICS each, every one flagged for
 * the daily pull, one request apiece. SAM.gov matches `ncode` exactly, so a
 * family would find nothing.
 */
export const ENFAV_SEARCHES: readonly { name: string; filter: QueryFilter }[] = [
  { name: 'Machine shops', filter: { naics: '332710' } },
  { name: 'Industrial machinery', filter: { naics: '333249' } },
  { name: 'Plastics products', filter: { naics: '326199' } },
  { name: 'Miscellaneous manufacturing', filter: { naics: '339999' } },
  { name: 'Custom programming', filter: { naics: '541511' } },
  { name: 'Systems design', filter: { naics: '541512' } },
  { name: 'Other computer services', filter: { naics: '541519' } },
  { name: 'Data processing and hosting', filter: { naics: '518210' } },
];
