import type { PromptDto } from '@sysdesign/contracts';
import type { Prompt } from '@sysdesign/db';

/** Owns the Date → ISO edge; `experience.id` needs no populate (FK identity). */
export const toPromptDto = (e: Prompt): PromptDto => ({
  id: e.id,
  experienceId: e.experience.id,
  archetype: e.archetype,
  title: e.title,
  scenario: e.scenario,
  functionalRequirements: e.functionalRequirements,
  functionalCapabilities: e.functionalCapabilities,
  nonFunctionalRequirements: e.nonFunctionalRequirements,
  scaleTargets: e.scaleTargets,
  difficulty: e.difficulty,
  status: e.status,
  seed: e.seed,
  generatorVersion: e.generatorVersion,
  llmEnriched: e.llmEnriched,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});
