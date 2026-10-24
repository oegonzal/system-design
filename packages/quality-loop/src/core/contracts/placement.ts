/**
 * The one rule most indexed validators share: every item the goal listed is
 * placed exactly once, and nothing is placed that the goal never listed — a
 * candidate given one verdict, a field answered once, an evidence alias used
 * under one memory or set aside as unused. The refs are the index's, written
 * by the system; what a pipeline brings is only what a placement is and how
 * each fault is worded to the producer.
 */
import type { Severity, ValidationProblem } from '@sysdesign/contracts';

import { problem } from './validation';

/** One reference an artifact makes, and where in the artifact it makes it (unlocated when absent). */
export interface Placement {
  readonly ref: string;
  readonly at?: readonly string[];
}

/** How a pipeline words each fault, given the ref and where it was placed. */
export interface PlacementWording {
  unlisted(ref: string, at: readonly string[]): string;
  repeated(ref: string, at: readonly string[]): string;
}

/**
 * Each placement against the refs the goal listed, in the artifact's order: one
 * the goal never listed, or one listed and already placed. Both are critical —
 * an artifact that places what was never listed, or one item twice, cannot be
 * read back one way. A repeat with no location of its own is located at the
 * ref it repeats.
 */
export function misplaced(
  listed: Iterable<string>,
  placements: Iterable<Placement>,
  say: PlacementWording,
): ValidationProblem[] {
  const known = new Set(listed);
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const { ref, at } of placements) {
    if (!known.has(ref)) {
      problems.push(problem('critical', say.unlisted(ref, at ?? []), [...(at ?? [])]));
    } else if (seen.has(ref)) {
      problems.push(problem('critical', say.repeated(ref, at ?? [ref]), [...(at ?? [ref])]));
    }
    seen.add(ref);
  }
  return problems;
}

/** The listed refs no placement names, in the goal's order, each worded by `say`. */
export const unplaced = (
  listed: readonly string[],
  placed: Iterable<string>,
  severity: Severity,
  say: (ref: string) => string,
): ValidationProblem[] => {
  const named = new Set(placed);
  return listed.filter((ref) => !named.has(ref)).map((ref) => problem(severity, say(ref)));
};

/** A count past the limit the goal stated, as one problem; none within it. */
export const overLimit = (count: number, limit: number, what: string): ValidationProblem[] =>
  count > limit ? [problem('high', `${count} ${what}; the limit is ${limit}`)] : [];
