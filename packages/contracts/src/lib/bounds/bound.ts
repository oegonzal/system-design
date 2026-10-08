/**
 * One declared bound for every string and list a model writes into, and the
 * salvage that keeps what it wrote.
 *
 * A bound is two numbers. The TARGET is what the model is asked for — the
 * `maxLength` or `maxItems` in the JSON Schema it sees. The CEILING is what
 * the zod schema accepts without a word: measured in-regime overshoots ran
 * +1.5%…+19% over the ask, so a quarter clears every one, and a floor keeps
 * short bounds from being tighter than a sentence. Past the ceiling the
 * parse is lenient, never a loss: prose is kept whole and recorded, prose
 * past `CUT_FACTOR` targets is cut at a word boundary with a visible marker,
 * a list is trimmed to its ceiling by whole items, and only a structural
 * fault — a wrong type, a missing field, an unknown id or enum value, an
 * empty required string — refuses the reply, with every fault named so the
 * next ask can say what broke. A size limit never discards work.
 */

export interface Bound {
  /** What the model is asked for. */
  readonly target: number;
  /** What is accepted without a word. */
  readonly ceiling: number;
}

/** Text is measured in characters; a list in items; an id is exact — target and ceiling are one number. */
export type BoundKind = 'text' | 'list' | 'id';

export interface DeclaredBound extends Bound {
  readonly kind: BoundKind;
}

/**
 * Tolerance as data, declared once: the share of the target the ceiling adds,
 * and the least it adds — forty characters matters only under ~160, two items
 * only under eight.
 */
export const BOUND_TOLERANCE = {
  text: { share: 0.25, floor: 40 },
  list: { share: 0.25, floor: 2 },
} as const;

/** Prose past this many targets is cut at a word boundary, with the marker. */
export const CUT_FACTOR = 3;
/** Appended where prose was cut, so a reader knows words are missing and a measurement knows a cut from a write. */
export const CUT_MARKER = ' […]';

/** A bound from its target: the ceiling is the larger of the share and the floor over it. */
export function bound(target: number, kind: Exclude<BoundKind, 'id'> = 'text'): Bound {
  const tolerance = BOUND_TOLERANCE[kind];
  return {
    target,
    ceiling: Math.max(Math.ceil(target * (1 + tolerance.share)), target + tolerance.floor),
  };
}

/**
 * Where a lenient read cuts prose written into this bound: three targets, or
 * the ceiling when that is more (a short target's floor can put the ceiling
 * past three targets, and nothing within the ceiling is ever cut).
 */
export const cutPoint = (b: Bound): number => Math.max(CUT_FACTOR * b.target, b.ceiling);

/**
 * The longest text a lenient read of this bound returns: what it keeps whole
 * runs to the cut point plus the marker's length, and what it cuts ends within
 * the same. Whatever must accept a value a lenient read returned — a rubric
 * handed back, a query that recalls a stored lesson — sizes against this,
 * never against the ceiling.
 */
export const keptAtMost = (b: Bound): number => cutPoint(b) + CUT_MARKER.length;

/** A bound with no tolerance: what is asked is exactly what is accepted — an engine cap, a count a caller slices to. */
export const exact = (size: number): Bound => ({ target: size, ceiling: size });

/**
 * The bound of a text composed from bounded parts and literal separators —
 * a table row joined into one statement, a lesson joined from its two halves.
 * Targets and ceilings add; a separator counts once, in both.
 */
export function composedBound(parts: readonly (Bound | string)[]): Bound {
  let target = 0;
  let ceiling = 0;
  for (const part of parts) {
    if (typeof part === 'string') {
      target += part.length;
      ceiling += part.length;
    } else {
      target += part.target;
      ceiling += part.ceiling;
    }
  }
  return { target, ceiling };
}
