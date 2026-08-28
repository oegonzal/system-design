import type {
  Archetype,
  NfrItem,
  PromptDifficulty,
  ScaleFacts,
  ScaleTargets,
} from '@sysdesign/contracts';

import { ARCHETYPE_TEMPLATES } from './archetype-templates';
import { REQUIREMENT_BANKS, type RequirementBank } from './requirement-banks';
import { mulberry32, pick, pickN } from './rng';

/**
 * Bump when template or bank changes would alter output for an existing seed —
 * a stored prompt records the version that produced it, so old rows stay
 * honest audit records rather than claiming to be reproducible when they are
 * no longer.
 */
export const GENERATOR_VERSION = '1.0.0';

/** The slice of an experience the generator reads. Structural, so an
 * `ExperienceProfile` entity can be passed directly. */
export interface GeneratorExperience {
  slug: string;
  archetype: Archetype;
  scaleFacts: ScaleFacts;
  companyLabel: string;
  title: string;
  highlights: string[];
}

export interface GeneratePromptInput {
  experience: GeneratorExperience;
  difficulty: PromptDifficulty;
  seed: number;
}

export interface GeneratedPrompt {
  title: string;
  scenario: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: NfrItem[];
  scaleTargets: ScaleTargets;
}

/**
 * Pure: the same input produces a deep-equal output, byte for byte. All
 * variation flows through one seeded PRNG consumed in a fixed order (title →
 * scenario → functional picks → NFR picks), which is what makes a stored
 * `seed` + `generatorVersion` a complete reproduction recipe.
 */
export function generatePrompt({
  experience,
  difficulty,
  seed,
}: GeneratePromptInput): GeneratedPrompt {
  const template = ARCHETYPE_TEMPLATES[experience.archetype];
  const bank = REQUIREMENT_BANKS[experience.archetype];
  const rng = mulberry32(seed);

  const scaleTargets = template.deriveScaleTargets(experience.scaleFacts, difficulty);
  const title = pick(rng, template.titleVariants);
  const scenario = template.scenario({
    facts: experience.scaleFacts,
    difficulty,
    targets: scaleTargets,
    rng,
  });

  const functionalCount = 4 + Math.floor(rng() * 3); // 4..6
  const functionalRequirements = pickN(rng, bank.functional, functionalCount);

  return {
    title,
    scenario,
    functionalRequirements,
    nonFunctionalRequirements: pickNfrs(rng, bank, difficulty),
    scaleTargets,
  };
}

/**
 * 3–5 NFRs with the invariant the eval engine relies on: at least one latency
 * and one availability requirement, always. Those two are drawn first (from
 * pools of 2+ each, so seeds still vary them); advanced difficulty then adds
 * one twist (multi-region / exactly-once / cost-cap); the rest fill from the
 * remaining bank without duplicates.
 */
function pickNfrs(
  rng: () => number,
  bank: RequirementBank,
  difficulty: PromptDifficulty,
): NfrItem[] {
  const latencyPool = bank.nfrs.filter((n) => n.kind === 'latency');
  const availabilityPool = bank.nfrs.filter((n) => n.kind === 'availability');

  const chosen: NfrItem[] = [pick(rng, latencyPool), pick(rng, availabilityPool)];
  if (difficulty === 'advanced') {
    chosen.push(pick(rng, bank.advancedTwists));
  }

  const targetCount = 3 + Math.floor(rng() * 3); // 3..5
  const remaining = bank.nfrs.filter((n) => !chosen.includes(n));
  const fill = Math.max(0, targetCount - chosen.length);
  chosen.push(...pickN(rng, remaining, fill));

  // Fresh objects so a caller mutating its prompt can never corrupt the bank.
  return chosen.map((n) => ({ ...n }));
}
