import { create, type Delta } from 'jsondiffpatch';

import { objectHash } from './object-hash';

/**
 * The two configured differs — the only module that constructs one.
 *
 * `detectMove` is on so that a reordered rubric reads as a move rather than as
 * every element after it changing. `includeValueOnMove` is off because the value
 * is unchanged by definition and carrying it doubles the delta.
 *
 * No `textDiff` is configured, on purpose. Supplying one would add a second
 * dependency and a patch encoding to decode, for exactly one field that
 * benefits — the rendered artifact — which `line-diff` handles in a form a
 * person can read. Without it, a changed string is reported whole, which is the
 * right default for an id, a reason or a rationale.
 */

/** Fields that say when something happened rather than what it decided. */
export const TIMING_FIELDS = [
  'durationMs',
  'startedAt',
  'finishedAt',
  'queuedMs',
  'at',
] as const satisfies readonly string[];

const TIMINGS = new Set<string>(TIMING_FIELDS);

const OPTIONS = {
  objectHash,
  arrays: { detectMove: true, includeValueOnMove: false },
} as const;

const full = create(OPTIONS);

/**
 * The same differ with the clock removed. A step observed twice differs in its
 * timings every time; ignoring them is what lets a reader see the poll where
 * something actually decided differently.
 */
const untimed = create({ ...OPTIONS, propertyFilter: (name: string) => !TIMINGS.has(name) });

/** The delta from one state to the next; `undefined` when nothing changed. */
export const diffOf = (before: unknown, after: unknown, ignoreTimings = false): Delta =>
  (ignoreTimings ? untimed : full).diff(before, after);

export type { Delta };
