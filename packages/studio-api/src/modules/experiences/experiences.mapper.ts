import type { ExperienceProfileDto } from '@sysdesign/contracts';
import type { ExperienceProfile } from '@sysdesign/db';

/**
 * Mappers are the single place a `Date` becomes an ISO string — scatter that
 * conversion across controllers and one missed call ships a Date object that
 * serialises differently.
 */
export const toExperienceProfileDto = (e: ExperienceProfile): ExperienceProfileDto => ({
  id: e.id,
  slug: e.slug,
  origin: e.origin,
  companyLabel: e.companyLabel,
  title: e.title,
  summary: e.summary,
  techStack: e.techStack,
  highlights: e.highlights,
  practiceHighlights: e.practiceHighlights,
  createdAt: e.createdAt.toISOString(),
});
