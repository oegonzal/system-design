import {
  describeIssue,
  modelSchema,
  parseLenient,
  type BoundPath,
  type DeclaredBound,
  type Overrun,
  type Repair,
  type SchemaIssue,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

/**
 * Reading one structured reply out of whatever a model wrote, and the names a
 * dump records the reading under.
 *
 * None of it is any provider's: a model that fences its JSON, narrates around
 * it, echoes the schema it was given or stops mid-object does so whoever
 * serves it, and the salvage ladder that decides what to keep is the
 * contract's. It lives here rather than in the adapter that happened to need
 * it first, so a second provider reads a reply exactly as the first does and
 * a reader comparing two runs is comparing the models rather than two
 * spellings of the same parse.
 */

/** The `error.name` a schema miss is recorded under; its message is the schema's own complaint. */
export const SCHEMA_MISS = 'SchemaMiss';

/**
 * The `error.name` an `ok` is recorded under when its value was read from the
 * transcript of a turn that ended without a result; the message is what
 * ended the turn.
 */
export const SALVAGED = 'Salvaged';

/** The `error.name` a turn is recorded under when its stream ended with no result and no error of its own. */
export const NO_RESULT = 'NoResult';

/** The `error.name` a call is recorded under when its own limit ended it. */
export const TIMED_OUT = 'Timeout';

/** The heading under which the next ask names what refused the last reply. */
export const FEEDBACK_HEADING =
  '# Your previous reply was refused — correct these and return the whole object again';

/** The heading under which the refused reply rides along, when it is small enough. */
export const PREVIOUS_REPLY_HEADING = '## The reply, as written';

/**
 * Scan `text` for balanced, string-aware top-level `{...}` objects and yield
 * each complete span. Unlike first-`{`-to-last-`}`, this survives an agent that
 * narrates, echoes the JSON Schema it was given, or quotes the current brief —
 * each of which drops extra braces into the reply. Braces inside JSON strings
 * (and their escapes) are ignored.
 */
function* braceObjects(text: string): Generator<string> {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) yield text.slice(start, i + 1);
      }
    }
  }
}

/**
 * Every span of `text` that could be the object: each fenced block, then each
 * balanced brace span, in that order, each once — a fenced object is also a
 * brace span, and reporting it twice told a reader one miss was two.
 */
export function jsonCandidates(text: string): string[] {
  const spans: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m = fence.exec(text); m !== null; m = fence.exec(text)) spans.push(m[1]);
  for (const span of braceObjects(text)) spans.push(span);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const span of spans) {
    const key = span.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(span);
  }
  return candidates;
}

/** A value the ladder accepted, with every field it kept past its target and every repair. */
export interface Read<T> {
  ok: true;
  value: T;
  overruns: Overrun[];
  repairs: Repair[];
}

/** No value: why, in words a dump can carry, and the faults the next ask is told. */
export interface Miss {
  ok: false;
  reason: string;
  issues: SchemaIssue[];
}

/** The one validated object with what the parse kept, or why there was none. */
export type Extraction<T> = Read<T> | Miss;

const structuralFaults = (issues: readonly SchemaIssue[]): number =>
  issues.filter((issue) => !issue.soft).length;

/**
 * Of several candidates that missed, the faults of the one that came
 * closest — the fewest structural faults, the first on a tie — which is the
 * one the next ask is told about. A soft fault is kept by the parse, so it
 * never makes a candidate further away.
 */
export function closestMiss(misses: readonly (readonly SchemaIssue[])[]): SchemaIssue[] {
  let closest: readonly SchemaIssue[] = [];
  let distance = Number.POSITIVE_INFINITY;
  for (const issues of misses) {
    const faults = structuralFaults(issues);
    if (faults < distance) {
      closest = issues;
      distance = faults;
    }
  }
  return [...closest];
}

const describeMiss = (issues: readonly SchemaIssue[]): string =>
  issues.map(describeIssue).join('; ');

/**
 * Pull the one JSON object out of a model's text. Tries every fenced block,
 * then every balanced brace span, returning the first that both parses AND
 * the salvage ladder accepts — a text past its bound kept whole or cut with
 * a marker, a list past its ceiling trimmed, an unasked-for key stripped,
 * every one of them recorded. A miss is structural: it names what each
 * parsed candidate got wrong in the one wording the next ask repeats, or
 * says that nothing parsed at all — a reply cut before its object closed
 * reads exactly like that. `bounds` are the schema's own declarations; a
 * caller that built the model schema already hands them over.
 */
export function parseStructured<T>(
  text: string,
  schema: ZodType<T>,
  bounds?: Readonly<Record<BoundPath, DeclaredBound>>,
): Extraction<T> {
  const candidates = jsonCandidates(text);
  const index = bounds ?? modelSchema(schema).bounds;
  const misses: SchemaIssue[][] = [];
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const result = parseLenient(schema, parsed, index);
    if (result.ok) {
      return { ok: true, value: result.value, overruns: result.overruns, repairs: result.repairs };
    }
    misses.push(result.issues);
  }
  if (misses.length === 0) {
    return {
      ok: false,
      reason: `no complete JSON object in the reply (${candidates.length} candidate span(s), none parsed)`,
      issues: [],
    };
  }
  return {
    ok: false,
    reason:
      misses.length === 1
        ? describeMiss(misses[0])
        : misses.map((miss, index) => `candidate ${index + 1}: ${describeMiss(miss)}`).join(' | '),
    issues: closestMiss(misses),
  };
}

/** `parseStructured` for a caller that only needs the object: `null` is the port's deterministic path. */
export function extractStructured<T>(text: string, schema: ZodType<T>): T | null {
  const extraction = parseStructured(text, schema);
  return extraction.ok ? extraction.value : null;
}
