/**
 * A composed goal's bookkeeping rides on the goal itself, as the LAST fenced
 * JSON block, so the loop's validators read the index the composer wrote and
 * never parse prose. The composers live outside the loop — the studio, the
 * browser session, the document ingester, a tool session — so the fence and
 * its reader are declared here, where every program can reach them, and the
 * loop's prompting stage strips the index with the same reader.
 */
import type { ZodType } from 'zod';

export const GOAL_INDEX_FENCE_OPEN = '```json\n';
export const GOAL_INDEX_FENCE_CLOSE = '\n```';

/**
 * The engine's goal budget. A composer that renders past it would have every
 * stage read a clipped goal while the validators read the whole one, so a
 * composer refuses instead; the loop's HTTP edge refuses the same budget.
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

/** The heading under which a composer writes its index: the last section of a goal, and the one no model is shown. */
export const GOAL_INDEX_HEADING = '## Index';

/**
 * The index section a composer ends its goal with: the heading, a blank
 * line, and the index as one single-line fenced JSON block. One shape for
 * every composer, so `stripIndexSection` can take it off again whole.
 */
export const renderIndexSection = (index: unknown): string =>
  `${GOAL_INDEX_HEADING}\n\n${GOAL_INDEX_FENCE_OPEN}${JSON.stringify(index)}${GOAL_INDEX_FENCE_CLOSE}`;

/**
 * The goal without its index section, for a model: the index is written for
 * the validators, and a model reading it is a model reading the engine's
 * bookkeeping instead of the page. Measured 2026-10-08: the index was the
 * largest section of a step goal, 12.5–13.5 KB of 33, 137 of its 150 entries
 * carrying only default facts, and it reached the producer and all three
 * lenses on every call. A goal whose last fence is not JSON, or that carries
 * no index section, is returned as it is.
 */
export function stripIndexSection(goal: string): string {
  const heading = goal.lastIndexOf(`${GOAL_INDEX_HEADING}\n`);
  if (heading < 0) return goal;
  const fence = goal.indexOf(GOAL_INDEX_FENCE_OPEN, heading);
  if (fence < 0) return goal;
  const close = goal.indexOf(GOAL_INDEX_FENCE_CLOSE, fence + GOAL_INDEX_FENCE_OPEN.length);
  if (close < 0 || goal.slice(close + GOAL_INDEX_FENCE_CLOSE.length).trim() !== '') return goal;
  try {
    JSON.parse(goal.slice(fence + GOAL_INDEX_FENCE_OPEN.length, close));
  } catch {
    return goal;
  }
  return goal.slice(0, heading).trimEnd();
}

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

/**
 * The alias of a goal's section, for a composer that renders the parts it is
 * given as numbered sections a model cites by alias: engine-assigned, from the
 * part's position, never anything the model wrote — so every codec that
 * numbers its sections numbers them alike.
 */
export const sectionAlias = (position: number): string => `section.${position + 1}`;
export const SECTION_ALIAS = /^section\.\d+$/;
