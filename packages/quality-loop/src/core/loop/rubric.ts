/**
 * A supplied rubric stands in for the derived one only when the task could
 * have derived it: ids unique, every kind one the task prices, no more
 * criteria than it allows, none longer than its deriver can return. Checked
 * before any row is written or any model is called; the problems name what
 * is wrong so the caller can fix its rubric. A criterion past the target and
 * within that length is no problem — it is an overrun on the run's record.
 */
import type { SuccessCriterion } from '@sysdesign/contracts';

import { overlongCriteria, providedStatementLimit, type TaskSpec } from '../contracts';

export function rubricProblems(
  criteria: readonly SuccessCriterion[],
  task: TaskSpec<unknown>,
): string[] {
  const problems: string[] = [];
  if (criteria.length === 0) problems.push('a rubric needs at least one criterion');

  const seen = new Set<string>();
  for (const criterion of criteria) {
    if (seen.has(criterion.id)) problems.push(`duplicate criterion id: ${criterion.id}`);
    seen.add(criterion.id);
    if (!(criterion.kind in task.criterionKinds)) {
      problems.push(
        `criterion ${criterion.id} has kind ${criterion.kind}; this pipeline prices ${Object.keys(task.criterionKinds).join(', ')}`,
      );
    }
  }

  if (criteria.length > task.maxCriteria) {
    problems.push(`${criteria.length} criteria supplied; this pipeline allows ${task.maxCriteria}`);
  }
  // Measured where the bound is declared, never read here: only which ids run past it.
  for (const id of overlongCriteria(criteria, task)) {
    problems.push(
      `criterion ${id} is longer than the ${providedStatementLimit(task)} characters this pipeline allows`,
    );
  }
  return problems;
}
