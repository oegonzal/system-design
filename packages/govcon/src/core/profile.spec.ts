import type { SearchProfile } from '@sysdesign/contracts';
import type { z } from 'zod';

import { ENFAV } from '../profiles/enfav';
import { searchProfileSchema, validateProfile } from './profile';
import { FACTORS } from './scoring';
import { tinyProfile } from './testing';

const ids = FACTORS.map((factor) => factor.id);

describe('the search profile', () => {
  it('[GOV-5] validates exactly the wire contract — the schema output and SearchProfile are one type', () => {
    expectTypeOf<z.output<typeof searchProfileSchema>>().toEqualTypeOf<SearchProfile>();
  });

  it('[GOV-5] accepts the tiny profile and the shipped Enfav profile', () => {
    expect(() => validateProfile(tinyProfile(), ids)).not.toThrow();
    expect(validateProfile(ENFAV, ids).id).toBe('enfav');
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
      /must name exactly the factors/,
    ],
    [
      'a missing factor weight',
      (p: ReturnType<typeof tinyProfile>) => {
        const rest = Object.fromEntries(
          Object.entries(p.scoring.weights).filter(([id]) => id !== 'psc'),
        );
        return { ...p, scoring: { ...p.scoring, weights: { ...rest, naics: 0.45 } } };
      },
      /must name exactly the factors/,
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
      'no slices to pull',
      (p: ReturnType<typeof tinyProfile>) => ({ ...p, pull: { ...p.pull, slices: [] } }),
      /pull\.slices/,
    ],
    [
      'an unknown field',
      (p: ReturnType<typeof tinyProfile>) => ({ ...p, extra: true }),
      /Unrecognized key/,
    ],
  ])('[GOV-5] rejects %s at load, naming the path', (_label, mutate, pattern) => {
    expect(() => validateProfile(mutate(tinyProfile()), ids)).toThrow(pattern);
    expect(() => validateProfile(mutate(tinyProfile()), ids)).toThrow(/^profile tiny: /);
  });
});
