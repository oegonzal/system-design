import {
  isDueSoonAt,
  TARGET_CLOSED_STAGE,
  TARGET_KINDS,
  TARGET_STAGES,
  type TargetSummary,
} from '@sysdesign/contracts';

import type { TargetRecord } from './ports';

/** Every stage of every kind at zero: what the counts start from, so a stage nothing stands at still reads as one. */
const emptyCounts = (): TargetSummary['byKind'] =>
  Object.fromEntries(
    TARGET_KINDS.map((kind) => [
      kind,
      Object.fromEntries(TARGET_STAGES[kind].map((stage) => [stage, 0])),
    ]),
  ) as TargetSummary['byKind'];

/** The targets counted: per kind every stage (zero included), what is due soon, the total. */
export function summarizeTargets(rows: readonly TargetRecord[], nowMs: number): TargetSummary {
  const byKind = emptyCounts();
  for (const row of rows) {
    const counts: Record<string, number> = byKind[row.kind];
    counts[row.stage] = (counts[row.stage] ?? 0) + 1;
  }
  return {
    byKind,
    dueSoon: rows.filter((row) => isDueSoonAt([row.reminderAt?.toISOString() ?? null], nowMs))
      .length,
    total: rows.length,
  };
}

/**
 * The awards a warm reads because they are tracked: every award target still
 * being pursued, the ones never read first and then the soonest to end, so
 * a bound cuts the awards furthest from their end.
 */
export function watchedAwards(rows: readonly TargetRecord[], limit: number): TargetRecord[] {
  const order = (row: TargetRecord): string => row.endsAt ?? '';
  return rows
    .filter((row) => row.kind === 'award' && row.stage !== TARGET_CLOSED_STAGE)
    .sort((a, b) => order(a).localeCompare(order(b)) || a.subject.localeCompare(b.subject))
    .slice(0, limit);
}
