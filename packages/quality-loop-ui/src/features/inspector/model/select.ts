import type { ActionGroup, ActionScope } from './action';
import { groupOf } from './action';
import { countKinds, type ChangeKind, type JsonChange } from './changes';
import type { Timeline, TimelineEntry } from './timeline';

/**
 * What the rail renders: an entry with the changes it made and their tally.
 *
 * The work is already done — each entry decoded its own delta when it was
 * appended — so this only chooses which of the two decodings to read and which
 * rows to show. Nothing here diffs anything, which is why the rail stays cheap
 * at two thousand rows.
 */

export interface TimelineRow {
  entry: TimelineEntry;
  changes: readonly JsonChange[];
  counts: Record<ChangeKind, number>;
}

export interface RowFilter {
  /** Only these action groups; every group when absent. */
  groups?: ReadonlySet<ActionGroup>;
  /** Only actions inside this scope — a run, a step, an iteration. */
  scope?: Partial<Pick<ActionScope, 'orchestrationRunId' | 'stepId' | 'runId' | 'iteration'>>;
  /** Read the decoding with the clock set aside. */
  ignoreTimings?: boolean;
}

/** Whether an action's scope is inside the one asked for. Absent keys are not constraints. */
export const inScope = (scope: ActionScope, wanted: RowFilter['scope']): boolean => {
  if (wanted === undefined) return true;
  return (
    (wanted.orchestrationRunId === undefined ||
      scope.orchestrationRunId === wanted.orchestrationRunId) &&
    (wanted.stepId === undefined || scope.stepId === wanted.stepId) &&
    (wanted.runId === undefined || scope.runId === wanted.runId) &&
    (wanted.iteration === undefined || scope.iteration === wanted.iteration)
  );
};

/** The rows to render, in log order. */
export function timelineRows(timeline: Timeline, filter: RowFilter = {}): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const entry of timeline.entries) {
    if (filter.groups !== undefined && !filter.groups.has(groupOf(entry.action.type))) continue;
    if (!inScope(entry.action.scope, filter.scope)) continue;
    const changes = filter.ignoreTimings === true ? entry.untimedChanges : entry.changes;
    rows.push({ entry, changes, counts: countKinds(changes) });
  }
  return rows;
}

/** Every group the log actually holds, in the declared order of the table. */
export function groupsPresent(timeline: Timeline): ActionGroup[] {
  const present = new Set<ActionGroup>();
  for (const entry of timeline.entries) present.add(groupOf(entry.action.type));
  return [...present];
}
