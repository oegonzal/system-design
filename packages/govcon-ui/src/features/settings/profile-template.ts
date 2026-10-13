import { DEFAULT_ALERT_POLICY, type SearchProfile } from '@sysdesign/contracts';

/**
 * What a new profile starts from: every price and band a scorer can read,
 * no codes and no interests — those are the company's to name. The weights
 * sum to 1; the two data-driven factors start at 0 until awards are stored.
 */
export const PROFILE_TEMPLATE: SearchProfile = {
  id: '',
  company: '',
  entityUei: null,
  naics: [],
  psc: [],
  interests: [],
  pull: { pageSize: 1000, maxPagesPerSlice: 1 },
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
  alerts: { ...DEFAULT_ALERT_POLICY },
};

/** A profile duplicated under a new slug, its company marked as the copy. */
export const copyOf = (profile: SearchProfile): SearchProfile => ({
  ...profile,
  id: `${profile.id}-copy`,
  company: `${profile.company} (copy)`,
});
