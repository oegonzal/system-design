/**
 * A record fitted to a goal budget, deterministically: the cheapest trim of
 * the facts first, one at a time, each drop counted, and a stop rather than a
 * loop once there is nothing left to give.
 */
import { textBytes } from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import type { Experience } from './schema';

const cap = (value: string, max: number): string => capText(value, max).text;

/** Below this, trimming the text loses more than dropping evidence would. */
const TEXT_FLOOR = 2_000;

const halve = (text: string): string => cap(text, Math.floor(textBytes(text) / 2));

/**
 * The cheapest single trim left over the facts: the artifact text, then the
 * prompt, then a trailing finding, then a trailing criterion — each drop
 * counted under `omitted`. Null when there is nothing left to drop. A codec
 * that carries more than the facts tries its own cheaper trims first and falls
 * back to this.
 */
export function trimExperience<R extends Experience>(record: R): R | null {
  if (record.artifact !== null && textBytes(record.artifact) > TEXT_FLOOR) {
    return { ...record, artifact: halve(record.artifact) };
  }
  if (textBytes(record.prompt) > TEXT_FLOOR) return { ...record, prompt: halve(record.prompt) };
  if (record.findings.length > 0) {
    return {
      ...record,
      findings: record.findings.slice(0, -1),
      omitted: { ...record.omitted, findings: record.omitted.findings + 1 },
    };
  }
  if (record.criteria.length > 0) {
    return {
      ...record,
      criteria: record.criteria.slice(0, -1),
      omitted: { ...record.omitted, criteria: record.omitted.criteria + 1 },
    };
  }
  return null;
}

/**
 * Fit a record to a budget, deterministically, one cheapest trim at a time —
 * and give up rather than loop when the trim has nothing left to give. The
 * render is the codec's, because only the codec knows what the model will
 * read; the budget is measured over exactly that text.
 */
export function fitToBudget<R>(
  record: R,
  render: (record: R) => string,
  trim: (record: R) => R | null,
  budget: number,
): R {
  let current = record;
  while (textBytes(render(current)) > budget) {
    const trimmed = trim(current);
    if (trimmed === null) return current;
    current = trimmed;
  }
  return current;
}
