import type { PromptDto } from '@sysdesign/contracts';
import type { Prompt } from '@sysdesign/db';

/** A prompt as a read answers it: the row plus whether practice has locked its rubric. */
export interface PromptView {
  prompt: Prompt;
  rubricLocked: boolean;
}

/** Owns the Date → ISO edge; `experience.id` needs no populate (FK identity). */
export const toPromptDto = ({ prompt: e, rubricLocked }: PromptView): PromptDto => ({
  id: e.id,
  experienceId: e.experience?.id ?? null,
  title: e.title,
  markdown: e.markdown,
  criteria: e.criteria,
  source: e.source,
  format: e.format,
  status: e.status,
  rubricLocked,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});
