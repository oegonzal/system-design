import type { ZodType } from 'zod';

import { modelSchema, walkJsonSchema, type BoundPath, type DeclaredBound } from './bounds';

/**
 * What the recorded runs measured, in one shape wherever bounds are declared:
 * a pipeline's folder (its deriver's and producer's fields, every stage's
 * output tokens), the engine's stages (what every lens writes) and here,
 * beside the schemas contracts declares for a model. The fixtures are written
 * by `pnpm measure:bounds` from the run dumps and committed; a spec holds each
 * declaration against its fixture, so a bound or a cap is sized from what the
 * model measurably does — never argued about, never left behind it.
 */

/** One field across the recorded replies: how many values, the longest, the 99th percentile, and how many ran past what their own call asked. */
export interface MeasuredField {
  n: number;
  max: number;
  p99: number;
  overTarget: number;
}

/** One stage's output tokens, thinking included, across its recorded turns, and the most API calls one took (null before calls were counted). */
export interface MeasuredCap {
  n: number;
  max: number;
  p99: number;
  maxApiCalls: number | null;
}

export interface MeasuredBounds {
  /** The first and last recorded run measured; null when none was. */
  since: string | null;
  until: string | null;
  runs: number;
  /** Text in characters and lists in items, by bound path. */
  fields: Readonly<Record<BoundPath, MeasuredField>>;
  /** Output tokens by stage id: `criteria`, `producer`, then each lens. */
  caps: Readonly<Record<string, MeasuredCap>>;
}

export interface MeasuredCheck {
  /**
   * Declarations this check does not hold, each with why — a field nothing
   * has written yet, a size a policy sets rather than a measurement. The
   * reason is the record: an exemption is read where it is made.
   */
  exempt?: Readonly<Record<BoundPath, string>>;
}

/**
 * A list asked for exactly what it accepts is a count its caller slices to —
 * a lens's `maxItems`, the task's `maxCriteria` — sized by policy, never by
 * what a model wrote, so no measurement holds it. Every other bound is held:
 * an id, a text, a list declared with tolerance.
 */
const isCallerCap = (declared: DeclaredBound): boolean =>
  declared.kind === 'list' && declared.target === declared.ceiling;

/**
 * Every size a schema shows the model, by path: each bound declared through
 * `bounded`, and a raw `.max` a schema not yet declared through it still
 * carries — read as a bound with no tolerance, which is how the salvage
 * reads it too (a text past it is kept, a list past it trimmed).
 */
function declaredSizes(schema: ZodType): Record<BoundPath, DeclaredBound> {
  const { json, bounds } = modelSchema(schema);
  const sizes: Record<BoundPath, DeclaredBound> = {};
  walkJsonSchema(json, '', (node, path) => {
    const declared = bounds[path];
    if (declared !== undefined) sizes[path] = declared;
    else if (typeof node['maxLength'] === 'number') {
      sizes[path] = { target: node['maxLength'], ceiling: node['maxLength'], kind: 'text' };
    } else if (typeof node['maxItems'] === 'number') {
      sizes[path] = { target: node['maxItems'], ceiling: node['maxItems'], kind: 'list' };
    }
  });
  return sizes;
}

/**
 * Every way the schemas' bounds fall short of the measurement — empty when
 * none does: a target below the 99th percentile written (the model is asked
 * for less than it writes, so most replies would be overruns), a ceiling at
 * or below the longest written (the longest would be kept past the ceiling,
 * never accepted), a measured path no schema declares any more (a renamed
 * field would drop out of the check), and a declared path nothing measured
 * that the caller did not exempt (a new field cannot join the schema
 * unmeasured). Several schemas are measured together when one
 * fixture holds what several stages wrote; a path two of them declare is a
 * fault, since one measurement cannot hold both.
 */
export function boundsAgainstMeasured(
  schemas: ZodType | readonly ZodType[],
  fields: Readonly<Record<BoundPath, MeasuredField>>,
  check: MeasuredCheck = {},
): string[] {
  const problems: string[] = [];
  const declared: Record<BoundPath, DeclaredBound> = {};
  for (const schema of Array.isArray(schemas) ? schemas : [schemas]) {
    for (const [path, bound] of Object.entries(declaredSizes(schema as ZodType))) {
      if (Object.hasOwn(declared, path)) problems.push(`${path}: declared by two schemas`);
      declared[path] = bound;
    }
  }
  const exempt = check.exempt ?? {};

  for (const [path, measured] of Object.entries(fields)) {
    const bound = declared[path];
    if (bound === undefined) {
      problems.push(`${path}: measured, but no schema declares a bound there`);
      continue;
    }
    if (isCallerCap(bound) || Object.hasOwn(exempt, path)) continue;
    if (bound.target < measured.p99) {
      problems.push(`${path}: target ${bound.target} < measured p99 ${measured.p99}`);
    }
    if (bound.ceiling <= measured.max) {
      problems.push(`${path}: ceiling ${bound.ceiling} ≤ measured max ${measured.max}`);
    }
  }
  for (const [path, bound] of Object.entries(declared)) {
    if (isCallerCap(bound) || Object.hasOwn(fields, path) || Object.hasOwn(exempt, path)) continue;
    problems.push(`${path}: declared, never measured`);
  }
  return problems;
}
