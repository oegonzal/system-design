/**
 * An input codec's bookkeeping rides on the goal itself, as the last fenced
 * JSON block, so a validator reads the index the codec wrote and never parses
 * prose. Each codec writes its own block — how it is formatted is that
 * codec's contract with its goals — and reads it back through here.
 */
import type { ZodType } from 'zod';

export const FENCE_OPEN = '```json\n';
export const FENCE_CLOSE = '\n```';

/** The last fenced JSON block of a goal, parsed against the schema; null when there is none that fits. */
export function readFencedIndex<I>(goal: string, schema: ZodType<I>): I | null {
  const open = goal.lastIndexOf(FENCE_OPEN);
  if (open < 0) return null;
  const start = open + FENCE_OPEN.length;
  const close = goal.indexOf(FENCE_CLOSE, start);
  if (close < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(goal.slice(start, close));
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}
