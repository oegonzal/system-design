import type { ApiNotFoundResponse } from './envelope';

/**
 * Everything a read of the studio API can find missing — the `missing` of
 * its 404s. A session, a revision and a prompt are the things a page is
 * about: when one is gone, the page is. An `evaluation` is a revision's
 * grade, missing while the revision itself is there — it was stored before
 * grading moved to the loop, or the grader no longer has its run — and a
 * `coaching-run` likewise a run the session, or the grader, does not have.
 */
export const STUDIO_RESOURCES = [
  'session',
  'revision',
  'evaluation',
  'coaching-run',
  'prompt',
  'library-prompt',
  'prompt-generation',
  'experience',
  'story',
] as const;
export type StudioResource = (typeof STUDIO_RESOURCES)[number];

/** The body of every 404 the studio API raises. */
export type StudioNotFoundResponse = ApiNotFoundResponse<StudioResource>;

/** What a failed read found missing, when its body says: null for any other body. */
export function missingResource(body: unknown): StudioResource | null {
  if (body === null || typeof body !== 'object' || !('missing' in body)) return null;
  const { missing } = body as { missing: unknown };
  return (STUDIO_RESOURCES as readonly unknown[]).includes(missing)
    ? (missing as StudioResource)
    : null;
}
