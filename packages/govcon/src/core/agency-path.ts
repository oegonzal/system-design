/**
 * The `department.subtier.office` convention a buyer is stored in, for names
 * and for codes alike. SAM.gov writes a notice's `fullParentPathName` and
 * `fullParentPathCode` this way; an adapter handed the parts one by one joins
 * them the same, here.
 */

const SEPARATOR = '.';

/**
 * The path out of its parts, present ones only; null when none. A part's own
 * dots are dropped, so every segment reads back whole: `U.S. Coast Guard` is
 * written `US Coast Guard`. Measured 2026-10-13: joined as given, each
 * "U.S. …" buyer was split in two and shown by its second half.
 */
export const dottedPath = (parts: readonly (string | null)[]): string | null => {
  const segments = parts
    .map((part) => (part ?? '').split(SEPARATOR).join('').trim())
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments.join(SEPARATOR) : null;
};

/** The department segment of a `department.subtier.office` code. */
export const toptierOf = (agencyCode: string | null): string | null => {
  const segment = agencyCode?.split(SEPARATOR)[0];
  return segment && segment.length > 0 ? segment : null;
};

/** The subtier segment of a `department.subtier.office` code — what an award and a notice share when the same buyer is behind both. */
export const subtierOf = (agencyCode: string | null): string | null => {
  const segment = agencyCode?.split(SEPARATOR)[1];
  return segment && segment.length > 0 ? segment : null;
};
