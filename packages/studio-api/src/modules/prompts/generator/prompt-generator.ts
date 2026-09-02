import type {
  Archetype,
  FunctionalCapability,
  NfrItem,
  PromptDifficulty,
  ScaleFacts,
  ScaleTargets,
  WorkflowSpec,
} from '@sysdesign/contracts';

import { ARCHETYPE_TEMPLATES } from './archetype-templates';
import { REQUIREMENT_BANKS, type RequirementBank } from './requirement-banks';
import { mulberry32, pick, pickN } from './rng';
import { WORKFLOW_SPECS } from './workflow-specs';

/**
 * Bump when template or bank changes would alter output for an existing seed —
 * a stored prompt records the version that produced it, so old rows stay
 * honest audit records rather than claiming to be reproducible when they are
 * no longer.
 */
export const GENERATOR_VERSION = '2.3.0'; // 2.3.0: order-history archetype; prompts may carry a workflowSpec

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
  /** Union of what the drawn requirements demand — what the engine gates on. */
  functionalCapabilities: FunctionalCapability[];
  nonFunctionalRequirements: NfrItem[];
  scaleTargets: ScaleTargets;
  /**
   * The business layer, a pure function of (archetype, difficulty) — never
   * drawn from the RNG, so attaching it costs existing seeds nothing.
   */
  workflowSpec: WorkflowSpec | null;
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
  // Annotated, not inferred: `as const` on the banks gives each entry a
  // distinct literal type that pickN cannot unify.
  const bank: RequirementBank = REQUIREMENT_BANKS[experience.archetype];
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
  const drawn = pickN(rng, bank.functional, functionalCount);
  // Sorted so the same draw always serializes identically — a stored prompt
  // stays byte-reproducible from its seed.
  const functionalCapabilities = [
    ...new Set(drawn.flatMap((requirement) => requirement.capabilities)),
  ].sort();

  const workflowSpec = WORKFLOW_SPECS[experience.archetype](difficulty);

  return {
    title,
    scenario,
    functionalRequirements: drawn.map((requirement) => requirement.text),
    functionalCapabilities,
    nonFunctionalRequirements: pickNfrs(rng, bank, difficulty, workflowSpec),
    scaleTargets,
    workflowSpec,
  };
}

/**
 * 4–6 NFRs with the invariants the eval engine relies on: at least one latency
 * and one availability requirement, plus the archetype's signature invariant
 * (`signatureNfrId`) — scenario prose asserts it on every prompt, so the
 * requirement list must always state its bar. Latency and availability draw
 * from pools of 2+ each, so seeds still vary them; advanced difficulty then
 * adds one twist (multi-region / exactly-once / cost-cap); the rest fill from
 * the remaining bank without duplicates, with the target floored so even the
 * larger advanced guaranteed set draws at least one fill.
 */
function pickNfrs(
  rng: () => number,
  bank: RequirementBank,
  difficulty: PromptDifficulty,
  workflowSpec: WorkflowSpec | null,
): NfrItem[] {
  const latencyPool = bank.nfrs.filter((n) => n.kind === 'latency');
  const availabilityPool = bank.nfrs.filter((n) => n.kind === 'availability');
  const signature = bank.nfrs.find((n) => n.id === bank.signatureNfrId);
  if (!signature) throw new Error(`signatureNfrId '${bank.signatureNfrId}' is not in its bank`);

  const guaranteed = [pick(rng, latencyPool), pick(rng, availabilityPool), signature];
  if (difficulty === 'advanced') {
    guaranteed.push(pick(rng, bank.advancedTwists));
  }

  // Every NFR a workflow ingest quotes a budget from must be on the prompt —
  // DERIVED from the spec, not a second bank field that could drift. Appends
  // consume no rng, so archetypes without a spec draw byte-identically.
  for (const ingest of workflowSpec?.ingests ?? []) {
    const linked = bank.nfrs.find((n) => n.id === ingest.nfrId);
    if (!linked)
      throw new Error(`ingest '${ingest.id}' names NFR '${ingest.nfrId}' not in its bank`);
    guaranteed.push(linked);
  }

  const chosen: NfrItem[] = [];
  const chosenIds = new Set<string>();
  for (const nfr of guaranteed) {
    if (!chosenIds.has(nfr.id)) {
      chosen.push(nfr);
      chosenIds.add(nfr.id);
    }
  }

  // 4..6, floored to one past the guaranteed set so fills always vary the
  // mix — capped at 6 so a large guaranteed set (signature + two freshness
  // budgets + a twist) cannot push the count past the stated bound.
  const targetCount = Math.min(6, Math.max(4 + Math.floor(rng() * 3), chosen.length + 1));
  const remaining = bank.nfrs.filter((n) => !chosenIds.has(n.id));
  chosen.push(...pickN(rng, remaining, Math.max(0, targetCount - chosen.length)));

  // Fresh objects so a caller mutating its prompt can never corrupt the bank.
  return chosen.map((n) => ({ ...n }));
}
