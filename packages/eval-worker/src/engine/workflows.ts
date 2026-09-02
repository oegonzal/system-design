import {
  judgeWorkflow,
  type WorkflowItemVerdict,
  type WorkflowReport,
  type WorkflowSpec,
} from '@sysdesign/contracts';

import type { GraphIndex } from './graph-index';
import { mechanismGraphOf } from './mechanisms';

/**
 * The engine's side of workflow corroboration, mirroring `mechanisms.ts`:
 * the judge lives in contracts so the editor's chips and the score are the
 * same code; this module only hands it the graph the engine already indexed.
 *
 * One judge call per run context — both the product bank and the product
 * rule pack read the same report, so an item can never be credited by one
 * and charged by the other.
 */
export function judgeGraphWorkflow(
  index: GraphIndex,
  spec: WorkflowSpec | null,
): WorkflowReport | null {
  if (spec === null) return null;
  return judgeWorkflow(mechanismGraphOf(index), spec);
}

export function verdictById(report: WorkflowReport): Map<string, WorkflowItemVerdict> {
  return new Map(report.items.map((item) => [item.itemId, item]));
}
