import type { $ZodIssue } from 'zod/v4/core';

import { CUT_MARKER, type BoundKind, type DeclaredBound } from './bound';
import {
  boundPath,
  keysOf,
  locationPath,
  type BoundPath,
  type LocationPath,
  type PathKey,
} from './json-paths';
import type { Overrun, OverrunHandling } from './overruns';

/**
 * One fault of a reply against its schema, in the words every reader uses:
 * the feedback on a retry, the refusal note, run.md. `soft` is a fault that
 * was noted and never refuses — a text past its bound, a list to trim, a key
 * to strip; everything else is structural.
 */
export interface SchemaIssue {
  code: string;
  path: LocationPath;
  at: PathKey[];
  message: string;
  /** For a size fault: what the schema accepts. */
  maximum?: number;
  /** For a size fault on a declared bound: what was asked. */
  target?: number;
  /** For a size fault: what was written. */
  actual?: number;
  kind?: BoundKind;
  soft: boolean;
}

export const sizeOfInput = (input: unknown): number | undefined =>
  typeof input === 'string' || Array.isArray(input) ? input.length : undefined;

/**
 * The branch of a union that wins is the first whose faults are all soft:
 * the reply meant that branch and only overshot it. A union with no such
 * branch stays one structural fault at the union. Inner paths are relative
 * to the union, so they are prefixed here.
 */
export function flattenIssues(
  issues: readonly $ZodIssue[],
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
  prefix: PathKey[] = [],
): $ZodIssue[] {
  const flat: $ZodIssue[] = [];
  for (const issue of issues) {
    const at = [...prefix, ...keysOf(issue.path)];
    if (issue.code === 'invalid_union' && issue.errors.length > 0) {
      const branches = issue.errors.map((branch) => flattenIssues(branch, bounds, at));
      const winner = branches.find((branch) =>
        branch.every((inner) => !isStructural(inner, bounds)),
      );
      if (winner !== undefined) {
        flat.push(...winner);
        continue;
      }
    }
    flat.push(prefix.length === 0 ? issue : { ...issue, path: at });
  }
  return flat;
}

const isRepairable = (issue: $ZodIssue): boolean =>
  issue.code === 'unrecognized_keys' || (issue.code === 'too_big' && issue.origin === 'array');

/** A text past its bound — unless the bound is an id's, which is exact. */
const isTextOverrun = (
  issue: $ZodIssue,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): boolean =>
  issue.code === 'too_big' &&
  issue.origin === 'string' &&
  bounds[boundPath(issue.path)]?.kind !== 'id';

/** Structural: not a size fault on text or a list, and not an aside key. */
export const isStructural = (
  issue: $ZodIssue,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): boolean => !isRepairable(issue) && !isTextOverrun(issue, bounds);

export function toSchemaIssue(
  issue: $ZodIssue,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): SchemaIssue {
  const at = keysOf(issue.path);
  const declared = bounds[boundPath(at)];
  const base: SchemaIssue = {
    code: issue.code,
    path: locationPath(at),
    at,
    message: issue.message,
    soft: false,
  };
  if (issue.code !== 'too_big') {
    return { ...base, soft: issue.code === 'unrecognized_keys' };
  }
  const kind: BoundKind =
    declared?.kind ??
    (issue.origin === 'array' ? 'list' : issue.origin === 'string' ? 'text' : 'id');
  const maximum = typeof issue.maximum === 'number' ? issue.maximum : Number(issue.maximum);
  return {
    ...base,
    maximum,
    target: declared?.target ?? maximum,
    actual: sizeOfInput(issue.input),
    kind,
    soft: kind !== 'id' && (issue.origin === 'array' || issue.origin === 'string'),
  };
}

/** Every fault of a parse as `SchemaIssue`s, unions flattened — for a caller that parsed strictly and wants the one wording. */
export const schemaIssuesOf = (
  issues: readonly $ZodIssue[],
  bounds: Readonly<Record<BoundPath, DeclaredBound>> = {},
): SchemaIssue[] => flattenIssues(issues, bounds).map((issue) => toSchemaIssue(issue, bounds));

const count = (value: number): string => value.toLocaleString('en-US');

/** `— noted, not refused`: the suffix of a soft fault, wherever one is listed. */
export const SOFT_ISSUE_NOTE = '— noted, not refused';

/** A fault's path and what is wrong there: the sizes of a size fault, or the schema's own message. */
function faultWording(issue: SchemaIssue): string {
  if (issue.maximum !== undefined && issue.actual !== undefined) {
    const unit = issue.kind === 'list' ? 'items' : 'characters';
    const asked = issue.target ?? issue.maximum;
    return `${issue.path}: ${count(issue.actual)} ${unit}; ${count(asked)} asked, ${count(issue.maximum)} accepted`;
  }
  return `${issue.path}: ${issue.message}`;
}

/**
 * The one wording of a fault: `findings[2].rationale: 1,015 characters; 900
 * asked, 1,125 accepted`, or the schema's own message after the path, with
 * the soft note where the fault did not refuse.
 */
export function describeIssue(issue: SchemaIssue): string {
  return issue.soft ? `${faultWording(issue)} ${SOFT_ISSUE_NOTE}` : faultWording(issue);
}

/**
 * What a field past its target came to, said after its sizes. Kept whole —
 * within the ceiling or past it — it was noted and not refused; a cut or a
 * trim lost work, and says what: where the text now ends, or how many items
 * went.
 */
const HANDLED: Record<OverrunHandling, (overrun: Overrun) => string> = {
  accepted: () => SOFT_ISSUE_NOTE,
  'kept-over-ceiling': () => SOFT_ISSUE_NOTE,
  cut: () => `— cut at a word boundary, marked ${CUT_MARKER.trim()}`,
  trimmed: (overrun) => {
    const dropped = overrun.dropped ?? overrun.actual - overrun.ceiling;
    return `— ${count(dropped)} ${dropped === 1 ? 'item' : 'items'} dropped`;
  },
};

/**
 * An overrun as the size fault it is — soft, never refused — so its sizes are
 * worded the way every size fault's are.
 */
export const overrunIssue = (overrun: Overrun): SchemaIssue => ({
  code: 'too_big',
  path: overrun.path,
  at: overrun.at,
  message: overrun.handling,
  maximum: overrun.ceiling,
  target: overrun.target,
  actual: overrun.actual,
  kind: overrun.kind,
  soft: true,
});

/**
 * One field past its target, in the one wording: what a diagnostic, a warning
 * and a log line say alike — its sizes as its size fault's, then whether work
 * was lost.
 */
export const describeOverrun = (overrun: Overrun): string =>
  `${faultWording(overrunIssue(overrun))} ${HANDLED[overrun.handling](overrun)}`;
