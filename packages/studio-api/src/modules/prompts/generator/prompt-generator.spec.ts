import { describe, expect, it } from 'vitest';
import { ARCHETYPES, PROMPT_DIFFICULTIES, type Archetype } from '@sysdesign/contracts';

import { DIFFICULTY_MULTIPLIERS } from './archetype-templates';
import { generatePrompt, type GeneratorExperience } from './prompt-generator';

/** Pure unit suite — no DB, no app boot. */

const experienceFor = (
  archetype: Archetype,
  overrides: Partial<GeneratorExperience> = {},
): GeneratorExperience => ({
  slug: `${archetype}-experience`,
  archetype,
  scaleFacts: { concurrentUsers: 8000, requestsPerSecond: 1500, notes: 'peaks are spiky' },
  companyLabel: 'A platform team',
  title: 'Scaled the platform through rapid growth',
  highlights: ['Scaled the core service', 'Cut incident rate'],
  ...overrides,
});

describe('generatePrompt', () => {
  it('[GEN-2] generates a deep-equal prompt for the same seed, and varies across seeds', () => {
    const experience = experienceFor('flash-sale-ticketing');

    const first = generatePrompt({ experience, difficulty: 'standard', seed: 42 });
    const second = generatePrompt({ experience, difficulty: 'standard', seed: 42 });
    expect(second).toEqual(first);

    // Different seeds must be able to change the title or the scenario.
    const flavours = new Set(
      Array.from({ length: 10 }, (_, seed) => {
        const p = generatePrompt({ experience, difficulty: 'standard', seed });
        return `${p.title}\n${p.scenario}`;
      }),
    );
    expect(flavours.size).toBeGreaterThan(1);
  });

  it('generates a complete prompt for every archetype', () => {
    for (const archetype of ARCHETYPES) {
      const prompt = generatePrompt({
        experience: experienceFor(archetype),
        difficulty: 'standard',
        seed: 7,
      });

      expect(prompt.title.length).toBeGreaterThan(0);
      expect(prompt.scenario).toContain('You are designing');
      expect(prompt.functionalRequirements.length).toBeGreaterThanOrEqual(4);
      expect(prompt.functionalRequirements.length).toBeLessThanOrEqual(6);
      expect(prompt.nonFunctionalRequirements.length).toBeGreaterThanOrEqual(3);
      expect(prompt.nonFunctionalRequirements.length).toBeLessThanOrEqual(5);
      expect(prompt.scaleTargets.concurrentUsers).toBeGreaterThan(0);
      expect(prompt.scaleTargets.requestsPerSecond).toBeGreaterThan(0);
      expect(prompt.scaleTargets.readWriteRatio).toMatch(/^\d+:\d+$/);
    }
  });

  it('stamps every NFR with a stable id and quantifies targets machine-readably', () => {
    for (const archetype of ARCHETYPES) {
      const { nonFunctionalRequirements } = generatePrompt({
        experience: experienceFor(archetype),
        difficulty: 'advanced',
        seed: 11,
      });
      for (const nfr of nonFunctionalRequirements) {
        expect(nfr.id).toMatch(/^[a-z]+-[a-z]+-[a-z-]+$/);
        if (nfr.targetSpec) {
          // The spec quantifies the prose target — never a number of its own.
          expect(nfr.target).toBeTruthy();
          expect(Number.isFinite(nfr.targetSpec.value)).toBe(true);
        }
      }
      const ids = nonFunctionalRequirements.map((nfr) => nfr.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('always includes at least one latency and one availability NFR', () => {
    for (const archetype of ARCHETYPES) {
      for (const difficulty of PROMPT_DIFFICULTIES) {
        for (let seed = 0; seed < 20; seed++) {
          const { nonFunctionalRequirements } = generatePrompt({
            experience: experienceFor(archetype),
            difficulty,
            seed,
          });
          const kinds = nonFunctionalRequirements.map((n) => n.kind);

          expect(kinds).toContain('latency');
          expect(kinds).toContain('availability');

          // Sampling never duplicates an entry.
          const statements = nonFunctionalRequirements.map((n) => n.statement);
          expect(new Set(statements).size).toBe(statements.length);
        }
      }
    }
  });

  it('multiplies scale targets by the difficulty multiplier', () => {
    const experience = experienceFor('realtime-analytics', {
      scaleFacts: { concurrentUsers: 100, requestsPerSecond: 10 },
    });

    for (const difficulty of PROMPT_DIFFICULTIES) {
      const { scaleTargets } = generatePrompt({ experience, difficulty, seed: 1 });
      expect(scaleTargets.concurrentUsers).toBe(100 * DIFFICULTY_MULTIPLIERS[difficulty]);
      expect(scaleTargets.requestsPerSecond).toBe(10 * DIFFICULTY_MULTIPLIERS[difficulty]);
    }
  });

  it('falls back to default scale facts when the experience has none', () => {
    const { scaleTargets } = generatePrompt({
      experience: experienceFor('workflow-automation', { scaleFacts: {} }),
      difficulty: 'intro',
      seed: 3,
    });

    expect(scaleTargets.concurrentUsers).toBe(5000);
    expect(scaleTargets.requestsPerSecond).toBe(1000);
  });
});
