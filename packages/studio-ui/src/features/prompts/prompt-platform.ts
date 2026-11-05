import {
  platformCatalogue,
  type PlatformCatalogue,
  type PlatformId,
  type PromptDto,
} from '@sysdesign/contracts';

/** The catalogue a prompt's design is drawn with, or none for a platform-neutral prompt — read as `practiceFormat(prompt.format)` is. */
export const promptPlatform = (
  prompt: Pick<PromptDto, 'platform'> | null,
): PlatformCatalogue | null =>
  prompt === null || prompt.platform === null ? null : platformCatalogue(prompt.platform);

export const platformLabel = (id: PlatformId): string => platformCatalogue(id).label;
