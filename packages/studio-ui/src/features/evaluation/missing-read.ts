import { missingResource, type StudioResource } from '@sysdesign/contracts';
import { ApiError } from '@sysdesign/web-kit';

/**
 * A read the API answered with "not there": the 404 itself, and what its
 * body names as missing (`missingResource`) — null when it does not say.
 */
export interface MissingRead {
  missing: StudioResource | null;
  /** The 404 — the server's words, and what a page's not-found notice classifies. */
  error: ApiError;
}

/** What a read came back with: the thing, or the fact that something is missing. */
export type ReadOutcome<T> = { found: T } | MissingRead;

export const isMissing = <T>(outcome: ReadOutcome<T>): outcome is MissingRead =>
  'missing' in outcome;

/**
 * A read whose 404 is an answer, not a throw. A poll that asks "is it done
 * yet?" can be told "there is no it" — and what there is none of decides what
 * the page does next, so the fact travels as data to whoever polls. Every
 * other failure still throws: an outage is about the road, not the resource.
 */
export async function readOrMissing<T>(read: Promise<T>): Promise<ReadOutcome<T>> {
  try {
    return { found: await read };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) {
      return { missing: missingResource(caught.body), error: caught };
    }
    throw caught;
  }
}

/**
 * What a practice page is about. When the API says one of these is missing,
 * the page's subject is gone — there is nothing left to grade, coach or save
 * — whichever read or write was the one to find out.
 */
const PAGE_SUBJECTS: readonly StudioResource[] = ['session', 'revision'];

/** The 404 that says the page's own subject is gone; null for any other failure. */
export function subjectGone(failure: unknown): ApiError | null {
  if (!(failure instanceof ApiError) || failure.status !== 404) return null;
  const missing = missingResource(failure.body);
  return missing !== null && PAGE_SUBJECTS.includes(missing) ? failure : null;
}

/** `subjectGone` for a read that already came back as an outcome. */
export const goneRead = <T>(outcome: ReadOutcome<T> | null): ApiError | null =>
  outcome !== null && isMissing(outcome) ? subjectGone(outcome.error) : null;
