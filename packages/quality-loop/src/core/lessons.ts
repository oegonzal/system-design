/**
 * What the run taught: which findings survived a revision and which it
 * resolved, which criteria improved and which regressed. Derived from the
 * iteration history alone, so a dump can be re-read into lessons later.
 */
import type { IterationTrace, Lesson } from '@sysdesign/contracts';
import { RESULT_WORST_FIRST } from './ordering';

const judged = <T>(iteration: IterationTrace<T>): boolean =>
  iteration.critics.some((outcome) => outcome.report !== null) ||
  iteration.evaluators.some((outcome) => outcome.report !== null);

export function deriveLessons<T>(iterations: readonly IterationTrace<T>[]): Lesson[] {
  const lessons: Lesson[] = [];
  for (let index = 1; index < iterations.length; index++) {
    const previous = iterations[index - 1];
    const current = iterations[index];
    if (!judged(previous) || !judged(current)) continue;
    const span = [previous.iteration, current.iteration];

    const currentKeys = new Set(current.ledger.findings.map((finding) => finding.key));
    for (const finding of previous.ledger.findings) {
      lessons.push(
        currentKeys.has(finding.key)
          ? {
              kind: 'persisted',
              subject: finding.key,
              iterations: span,
              detail: 'the finding survived the revision',
            }
          : {
              kind: 'resolved',
              subject: finding.key,
              iterations: span,
              detail: 'the finding did not recur',
            },
      );
    }

    const previousResults = new Map(
      previous.ledger.criteria.map((evidence) => [evidence.criterionId, evidence.result]),
    );
    for (const evidence of current.ledger.criteria) {
      const before = previousResults.get(evidence.criterionId);
      const rankBefore = before ? RESULT_WORST_FIRST.indexOf(before as never) : -1;
      const rankAfter = RESULT_WORST_FIRST.indexOf(evidence.result as never);
      if (rankBefore < 0 || rankAfter < 0 || rankBefore === rankAfter) continue;
      lessons.push({
        kind: rankAfter > rankBefore ? 'improved' : 'regressed',
        subject: evidence.criterionId,
        iterations: span,
        detail: `${before} → ${evidence.result}`,
      });
    }
  }
  return lessons;
}
