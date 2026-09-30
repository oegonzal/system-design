import type { PromptDto } from '@sysdesign/contracts';
import type { Prompt } from '@sysdesign/db';

/** Owns the Date → ISO edge; `experience.id` needs no populate (FK identity). */
export const toPromptDto = (e: Prompt): PromptDto => ({
  id: e.id,
  experienceId: e.experience?.id ?? null,
  title: e.title,
  markdown: e.markdown,
  criteria: e.criteria,
  source: e.source,
  status: e.status,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});
