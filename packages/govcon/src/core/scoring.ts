import {
  FACTOR_IDS,
  type FactorId,
  type FactorTrace,
  type Interest,
  type Lead,
  type LeadTier,
  type Opportunity,
  type SearchProfile,
} from '@sysdesign/contracts';

import { containsPhrase, tokenize } from './text';

export type { FactorTrace, Lead };

/**
 * Deterministic ranking. Each factor reads the opportunity, the profile and
 * the context and answers a value in [0, 1], an optional exclude gate and the
 * evidence it saw; `scoreLead` applies the gates first and then the profile's
 * weights, and the trace it returns is the arithmetic — every point is
 * attributable. Nothing here is tuned in code: families, phrases, prices,
 * bands and thresholds are all the profile's data. The table is closed over
 * `FACTOR_IDS`, so a profile prices every factor and no factor goes unpriced.
 */

export interface FactorAssessment {
  value: number;
  gate: 'exclude' | null;
  evidence: string[];
}

/** What the stored awards say about a code and an agency. */
export interface HistoryIndex {
  /** Awards signed in the last `days` days in this NAICS, and how many of them at this agency. */
  countFor(
    naics: string | null,
    agencyCode: string | null,
    days: number,
  ): { same: number; agency: number };
}

/** What a scoring reads besides the record and the profile: the instant, and the store's history. */
export interface ScoringContext {
  nowMs: number;
  history: HistoryIndex;
}

export interface Factor {
  assess(
    opportunity: Opportunity,
    profile: SearchProfile,
    context: ScoringContext,
  ): FactorAssessment;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const assessed = (value: number, ...evidence: string[]): FactorAssessment => ({
  value: clamp(value),
  gate: null,
  evidence,
});
const excluded = (reason: string): FactorAssessment => ({
  value: 0,
  gate: 'exclude',
  evidence: [reason],
});
const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * A code system is a hierarchy: a shorter code in the profile names the whole
 * family under it, and matching by prefix is that system's own semantics. A
 * six-digit NAICS matched exactly is worth 1; a four-digit family, 4/6.
 */
function familyMatch(
  label: string,
  codes: readonly string[],
  families: readonly string[],
  width: number,
): FactorAssessment {
  let best: { value: number; evidence: string } | null = null;
  for (const code of codes) {
    for (const family of families) {
      if (!code.startsWith(family)) continue;
      const value = family.length / width;
      if (best === null || value > best.value) {
        best = {
          value,
          evidence: family === code ? `${label} ${code}` : `${label} ${code} in family ${family}`,
        };
      }
    }
  }
  return best ? assessed(best.value, best.evidence) : assessed(0, `no ${label} family matched`);
}

function matchInterests(title: string, interests: readonly Interest[]): FactorAssessment {
  const tokens = tokenize(title);
  let total = 0;
  const evidence: string[] = [];
  for (const interest of interests) {
    const hit = [interest.term, ...interest.aliases].find((phrase) =>
      containsPhrase(tokens, tokenize(phrase)),
    );
    if (hit === undefined) continue;
    total += interest.weight;
    evidence.push(hit === interest.term ? interest.term : `${interest.term} (as "${hit}")`);
  }
  return evidence.length > 0 ? assessed(total, ...evidence) : assessed(0, 'no interest matched');
}

const codesOf = (opportunity: Opportunity): string[] => [
  ...new Set(
    [opportunity.naicsCode, ...opportunity.naicsCodes].filter(
      (code): code is string => typeof code === 'string' && code.length > 0,
    ),
  ),
];

/** The first band the days fit, else `beyond`. */
const banded = (
  days: number,
  bands: readonly { maxDays: number; value: number }[],
  beyond: number,
): { value: number; band: boolean } => {
  const band = bands.find((candidate) => days <= candidate.maxDays);
  return band ? { value: band.value, band: true } : { value: beyond, band: false };
};

export const FACTORS: Record<FactorId, Factor> = {
  naics: {
    assess: (opportunity, profile) => familyMatch('naics', codesOf(opportunity), profile.naics, 6),
  },
  psc: {
    assess: (opportunity, profile) =>
      familyMatch(
        'psc',
        opportunity.classificationCode ? [opportunity.classificationCode] : [],
        profile.psc,
        4,
      ),
  },
  interests: {
    assess: (opportunity, profile) => matchInterests(opportunity.title, profile.interests),
  },
  setAside: {
    assess: (opportunity, profile) => {
      const code = opportunity.setAsideCode;
      if (code === null) return assessed(profile.scoring.setAside.unrestricted, 'unrestricted');
      const price = profile.scoring.setAside.byCode[code];
      return price === undefined
        ? excluded(`ineligible set-aside ${code}`)
        : assessed(price, `set-aside ${code}`);
    },
  },
  noticeType: {
    assess: (opportunity, profile) => {
      const type = opportunity.noticeType;
      const policy = profile.scoring.noticeType;
      if (type !== null && policy.exclude.includes(type)) return excluded(`notice type ${type}`);
      const price = type === null ? undefined : policy.byType[type];
      return price === undefined
        ? assessed(policy.default, `notice type ${type ?? 'unknown'} priced by default`)
        : assessed(price, `notice type ${type}`);
    },
  },
  deadline: {
    assess: (opportunity, profile, { nowMs }) => {
      if (opportunity.active === false) return excluded('inactive');
      const policy = profile.scoring.deadline;
      if (opportunity.responseDeadlineAt === null)
        return assessed(policy.none, 'no deadline stated');
      const deadlineMs = Date.parse(opportunity.responseDeadlineAt);
      if (Number.isNaN(deadlineMs)) return assessed(policy.none, 'deadline unreadable');
      if (deadlineMs < nowMs) return excluded(`deadline passed ${opportunity.responseDeadlineAt}`);
      const daysLeft = (deadlineMs - nowMs) / DAY_MS;
      const days = Math.ceil(daysLeft);
      const { value, band } = banded(daysLeft, policy.bands, policy.beyond);
      return assessed(
        value,
        band ? `${days} day(s) to respond` : `${days} day(s) to respond, beyond the last band`,
      );
    },
  },
  history: {
    assess: (opportunity, profile, { history }) => {
      const policy = profile.scoring.history;
      const code = opportunity.naicsCode;
      const { same, agency } = history.countFor(code, opportunity.agencyCode, policy.days);
      if (same === 0) return assessed(0, `no stored award in naics ${code ?? 'unknown'}`);
      return assessed(
        same / policy.saturateAt,
        `${same} stored award(s) in naics ${code} in the last ${policy.days} day(s)`,
        ...(agency > 0 ? [`${agency} of them at this agency`] : []),
      );
    },
  },
  freshness: {
    assess: (opportunity, profile, { nowMs }) => {
      const policy = profile.scoring.freshness;
      const postedMs = Date.parse(opportunity.postedAt);
      const days = Number.isNaN(postedMs) ? Infinity : Math.max(0, (nowMs - postedMs) / DAY_MS);
      const { value, band } = banded(days, policy.bands, policy.beyond);
      const ago = Number.isFinite(days)
        ? `posted ${Math.floor(days)} day(s) ago`
        : 'posted date unreadable';
      return assessed(value, band ? ago : `${ago}, beyond the last band`);
    },
  },
};

const tenth = (value: number): number => Math.round(value * 10) / 10;

export function tierOf(score: number, profile: SearchProfile): LeadTier {
  if (score >= profile.scoring.tiers.high) return 'high';
  if (score >= profile.scoring.tiers.medium) return 'medium';
  return 'low';
}

export function scoreLead(
  opportunity: Opportunity,
  profile: SearchProfile,
  context: ScoringContext,
): Lead {
  const factors: FactorTrace[] = [];
  let excluded: Lead['excluded'] = null;
  for (const id of FACTOR_IDS) {
    const weight = profile.scoring.weights[id];
    const assessment = FACTORS[id].assess(opportunity, profile, context);
    if (assessment.gate === 'exclude' && excluded === null) {
      excluded = { factor: id, reason: assessment.evidence[0] ?? id };
    }
    factors.push({
      id,
      value: assessment.value,
      weight,
      points: tenth(100 * weight * assessment.value),
      evidence: assessment.evidence,
    });
  }
  if (excluded) return { opportunity, score: 0, tier: null, factors, excluded };
  const score = tenth(factors.reduce((total, trace) => total + trace.points, 0));
  return { opportunity, score, tier: tierOf(score, profile), factors, excluded: null };
}

const byRank = (a: Lead, b: Lead): number =>
  b.score - a.score ||
  b.opportunity.postedAt.localeCompare(a.opportunity.postedAt) ||
  a.opportunity.noticeId.localeCompare(b.opportunity.noticeId);

/** Every candidate scored; leads ranked, exclusions kept apart with their reason. */
export function rankLeads(
  candidates: readonly Opportunity[],
  profile: SearchProfile,
  context: ScoringContext,
): { leads: Lead[]; excluded: Lead[] } {
  const scored = candidates.map((candidate) => scoreLead(candidate, profile, context));
  return {
    leads: scored.filter((lead) => lead.excluded === null).sort(byRank),
    excluded: scored.filter((lead) => lead.excluded !== null),
  };
}
