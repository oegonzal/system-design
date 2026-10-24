import {
  DEFAULT_ALERT_POLICY,
  DEFAULT_TEAMING_POLICY,
  MAX_ALERT_ENDING_DAYS,
  type SearchProfile,
} from '@sysdesign/contracts';
import type { z } from 'zod';

import { ENFAV } from '../profiles/enfav';
import { parseProfile, searchProfileSchema, validateProfile } from './profile';
import { tinyProfile } from './testing';

describe('the search profile', () => {
  it('[GOV-5] validates exactly the wire contract — the schema output and SearchProfile are one type', () => {
    expectTypeOf<z.output<typeof searchProfileSchema>>().toEqualTypeOf<SearchProfile>();
  });

  it('[GOV-5] [GOV-24] reads a document without an alert policy as the declared default', () => {
    const { alerts: _alerts, ...bare } = tinyProfile();
    expect(validateProfile(bare).alerts).toEqual(DEFAULT_ALERT_POLICY);
  });

  it('[GOV-5] [GOV-33] reads an alert policy stored before it said whose awards are raised or how much must be obligated as the declared default for each, and refuses an audience it does not have or a floor below nothing with the path named', () => {
    const stored = { ...tinyProfile(), alerts: { endingWithinDays: 30, pulseAboveBand: false } };
    expect(validateProfile(stored).alerts).toEqual({
      endingWithinDays: 30,
      pulseAboveBand: false,
      audience: DEFAULT_ALERT_POLICY.audience,
      minObligated: DEFAULT_ALERT_POLICY.minObligated,
      newLeadTier: DEFAULT_ALERT_POLICY.newLeadTier,
      followUpAfterBusinessDays: DEFAULT_ALERT_POLICY.followUpAfterBusinessDays,
    });
    expect(
      validateProfile({
        ...tinyProfile(),
        alerts: { ...DEFAULT_ALERT_POLICY, audience: 'watched', minObligated: 250_000 },
      }).alerts,
    ).toMatchObject({ audience: 'watched', minObligated: 250_000 });
    for (const [alerts, path] of [
      [{ ...DEFAULT_ALERT_POLICY, audience: 'everyone' }, 'alerts.audience'],
      [{ ...DEFAULT_ALERT_POLICY, minObligated: -1 }, 'alerts.minObligated'],
    ] as const) {
      const parsed = parseProfile({ ...tinyProfile(), alerts });
      if (parsed.ok) throw new Error('expected issues');
      expect(parsed.issues.map((issue) => issue.path)).toEqual([path]);
    }
  });

  it('[GOV-5] [GOV-36] reads an alert policy stored before it named a tier for new leads as the declared default, keeps a tier or none when one is stored, and refuses a tier outside the vocabulary with the path named', () => {
    const { newLeadTier: _tier, ...before } = DEFAULT_ALERT_POLICY;
    expect(validateProfile({ ...tinyProfile(), alerts: before }).alerts.newLeadTier).toBe('high');
    for (const newLeadTier of ['medium', null] as const) {
      expect(
        validateProfile({ ...tinyProfile(), alerts: { ...DEFAULT_ALERT_POLICY, newLeadTier } })
          .alerts.newLeadTier,
      ).toBe(newLeadTier);
    }
    const parsed = parseProfile({
      ...tinyProfile(),
      alerts: { ...DEFAULT_ALERT_POLICY, newLeadTier: 'urgent' },
    });
    if (parsed.ok) throw new Error('expected issues');
    expect(parsed.issues.map((issue) => issue.path)).toEqual(['alerts.newLeadTier']);
  });

  it('[GOV-5] [GOV-29] reads a document without a teaming policy as the declared default, and refuses a smallest subcontract above the largest with the path named', () => {
    const { teaming: _teaming, ...bare } = tinyProfile();
    expect(validateProfile(bare).teaming).toEqual(DEFAULT_TEAMING_POLICY);
    expect(validateProfile(ENFAV).teaming).toEqual({
      subcontract: { min: 50_000, max: 2_000_000 },
    });
    const inverted = parseProfile({
      ...tinyProfile(),
      teaming: { subcontract: { min: 2_000_000, max: 50_000 } },
    });
    expect(inverted).toEqual({
      ok: false,
      issues: [
        {
          path: 'teaming.subcontract',
          message: 'the smallest subcontract must not be above the largest',
        },
      ],
    });
  });

  it('[GOV-5] accepts the tiny profile and the shipped Enfav profile', () => {
    expect(() => validateProfile(tinyProfile())).not.toThrow();
    expect(validateProfile(ENFAV).id).toBe('enfav');
    expect(parseProfile(tinyProfile())).toEqual({ ok: true, profile: tinyProfile() });
  });

  it.each([
    [
      'weights that do not sum to one',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        scoring: { ...p.scoring, weights: { ...p.scoring.weights, naics: 0.5 } },
      }),
      /weights sum to/,
    ],
    [
      'a weight for a factor that does not exist',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        scoring: { ...p.scoring, weights: { ...p.scoring.weights, naics: 0.2, magic: 0.1 } },
      }),
      /Unrecognized key/,
    ],
    [
      'a missing factor weight',
      (p: ReturnType<typeof tinyProfile>) => {
        const rest = Object.fromEntries(
          Object.entries(p.scoring.weights).filter(([id]) => id !== 'psc'),
        );
        return { ...p, scoring: { ...p.scoring, weights: { ...rest, naics: 0.45 } } };
      },
      /weights\.psc/,
    ],
    [
      'a NAICS code that is not 2–6 digits',
      (p: ReturnType<typeof tinyProfile>) => ({ ...p, naics: ['33271A'] }),
      /naics\.0/,
    ],
    [
      'bands out of order',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        scoring: {
          ...p.scoring,
          deadline: {
            ...p.scoring.deadline,
            bands: [
              { maxDays: 14, value: 1 },
              { maxDays: 3, value: 0.3 },
            ],
          },
        },
      }),
      /bands must ascend/,
    ],
    [
      'tiers that do not descend',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        scoring: { ...p.scoring, tiers: { high: 40, medium: 45 } },
      }),
      /high must be above medium/,
    ],
    [
      'a set-aside price above one',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        scoring: { ...p.scoring, setAside: { byCode: { SBA: 1.5 }, unrestricted: 0.5 } },
      }),
      /setAside\.byCode\.SBA/,
    ],
    [
      'a page size over the provider ceiling',
      (p: ReturnType<typeof tinyProfile>) => ({ ...p, pull: { ...p.pull, pageSize: 5000 } }),
      /pull\.pageSize/,
    ],
    [
      'a UEI that is not twelve characters',
      (p: ReturnType<typeof tinyProfile>) => ({ ...p, entityUei: 'short' }),
      /entityUei/,
    ],
    [
      'freshness bands out of order',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        scoring: {
          ...p.scoring,
          freshness: {
            ...p.scoring.freshness,
            bands: [
              { maxDays: 14, value: 1 },
              { maxDays: 3, value: 0.3 },
            ],
          },
        },
      }),
      /freshness\.bands bands must ascend/,
    ],
    [
      'an unknown field',
      (p: ReturnType<typeof tinyProfile>) => ({ ...p, extra: true }),
      /Unrecognized key/,
    ],
    [
      'an alert window past the bound',
      (p: ReturnType<typeof tinyProfile>) => ({
        ...p,
        alerts: { ...p.alerts, endingWithinDays: MAX_ALERT_ENDING_DAYS + 1 },
      }),
      /alerts\.endingWithinDays/,
    ],
  ])('[GOV-5] [GOV-13] rejects %s at load, naming the path', (_label, mutate, pattern) => {
    expect(() => validateProfile(mutate(tinyProfile()))).toThrow(pattern);
    expect(() => validateProfile(mutate(tinyProfile()))).toThrow(/^profile tiny: /);
    const parsed = parseProfile(mutate(tinyProfile()));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error('expected issues');
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues.every((issue) => typeof issue.path === 'string')).toBe(true);
  });
});
