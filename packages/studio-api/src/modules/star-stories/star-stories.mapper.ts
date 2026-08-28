import type { StarStoryDto } from '@sysdesign/contracts';
import type { StarStory } from '@sysdesign/db';

/** FK ids come straight off the references — no populate needed. */
export const toStarStoryDto = (s: StarStory): StarStoryDto => ({
  id: s.id,
  title: s.title,
  situation: s.situation,
  task: s.task,
  action: s.action,
  result: s.result,
  tags: s.tags,
  promptId: s.prompt?.id ?? null,
  experienceId: s.experience?.id ?? null,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});
