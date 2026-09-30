import { reconcileBrief } from './brief-repair';
import type { CriterionRef } from './brief-validator';
import type { DesignSubmission } from './canvas.schema';
import { reconcileNarration } from './narration-repair';

/**
 * A submission repaired the way the editor repairs a draft: the brief and the
 * narrative lose what the rubric or the canvas no longer supports, and the
 * graph is left exactly as it is — an edge to a node that is not there is
 * not repairable, only refusable. Idempotent, so a consumer that re-runs it
 * on a stored submission changes nothing; and total, so a valid submission
 * comes back equal to itself.
 */
export function repairSubmission(
  submission: DesignSubmission,
  criteria: readonly CriterionRef[],
): DesignSubmission {
  const { graph, brief, narrative } = submission;
  return {
    graph,
    brief: brief === null ? null : reconcileBrief(brief.bindings, graph, criteria),
    narrative:
      narrative === null
        ? null
        : reconcileNarration(
            narrative.overview ?? '',
            narrative.componentRationales,
            narrative.criterionNarrations,
            graph,
            criteria,
          ),
  };
}
