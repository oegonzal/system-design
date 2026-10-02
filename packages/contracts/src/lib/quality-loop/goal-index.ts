/**
 * A composed goal's bookkeeping rides on the goal itself, as the LAST fenced
 * JSON block, so the loop's validators read the index the composer wrote and
 * never parse prose. The composers live outside the loop — the studio, the
 * browser session, the document ingester — so the fence and its reader are
 * declared here, where every program can reach them; the loop's own copy in
 * `core/contracts/goal-index.ts` is pinned equal by a spec there.
 */
import type { ZodType } from 'zod';

export const GOAL_INDEX_FENCE_OPEN = '```json\n';
export const GOAL_INDEX_FENCE_CLOSE = '\n```';

/**
 * The engine's goal budget. A composer that renders past it would have every
 * stage read a clipped goal while the validators read the whole one, so a
 * composer refuses instead; the loop's `GOAL_MAX_BYTES` is pinned equal.
 */
export const GOAL_BUDGET_BYTES = 64_000;

/** UTF-8 length without `Buffer`, so a web client can measure a goal too. */
export const textBytes = (text: string): number => new TextEncoder().encode(text).length;

/** A composer's refusal: the goal it would write does not fit the engine's budget. */
export class GoalBudgetExceeded extends Error {
  override readonly name = 'GoalBudgetExceeded';
  constructor(
    readonly bytes: number,
    readonly budget: number,
  ) {
    super(`the goal renders to ${bytes} bytes, past the budget of ${budget}`);
  }
}

/** The goal when it fits, or the refusal. */
export function withinBudget(goal: string, budget = GOAL_BUDGET_BYTES): string {
  const bytes = textBytes(goal);
  if (bytes > budget) throw new GoalBudgetExceeded(bytes, budget);
  return goal;
}

/** One index, single-line, as the last block of a goal. */
export const renderFencedIndex = (index: unknown): string =>
  `${GOAL_INDEX_FENCE_OPEN}${JSON.stringify(index)}${GOAL_INDEX_FENCE_CLOSE}`;

/** The last fenced JSON block of a goal, parsed against the schema; null when there is none that fits. */
export function readFencedIndex<I>(goal: string, schema: ZodType<I>): I | null {
  const open = goal.lastIndexOf(GOAL_INDEX_FENCE_OPEN);
  if (open < 0) return null;
  const start = open + GOAL_INDEX_FENCE_OPEN.length;
  const close = goal.indexOf(GOAL_INDEX_FENCE_CLOSE, start);
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
