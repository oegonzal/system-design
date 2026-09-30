import type { CriterionRef } from './brief-validator';
import {
  NARRATION_MAX_COMPONENT_RATIONALES,
  NARRATION_MAX_CRITERION_NARRATIONS,
  NARRATION_OVERVIEW_MAX_LENGTH,
  NARRATION_PROSE_MAX_LENGTH,
} from './canvas';
import {
  NARRATION_VERSION,
  type CanvasGraph,
  type ComponentRationale,
  type CriterionNarration,
  type DesignNarrative,
} from './canvas.schema';

/**
 * The repair of a narrative — the drop-side twin of `validateNarration`, and
 * the prose sibling of `reconcileBrief`. A rationale for a node the canvas no
 * longer has and a narration for a criterion the rubric never listed are
 * dropped, exactly as a binding whose node was deleted is dropped. Thinness
 * is never judged here: whether a rationale explains anything is the
 * explanation critic's call; this only knows written from unwritten.
 */

/**
 * The parts as a payload, or `null` when nothing is written.
 *
 * Null rather than an empty narrative on purpose: the lenses read "no
 * narrative" as exactly that, while a stored empty one would imply the author
 * chose to explain nothing — the same trap `reconcileBrief` avoids.
 */
export function reconcileNarration(
  overview: string,
  rationales: readonly ComponentRationale[],
  narrations: readonly CriterionNarration[],
  graph: CanvasGraph,
  criteria: readonly CriterionRef[],
): DesignNarrative | null {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));

  const seenNodes = new Set<string>();
  const componentRationales = rationales
    .map((rationale) => ({
      nodeId: rationale.nodeId,
      prose: rationale.prose.trim().slice(0, NARRATION_PROSE_MAX_LENGTH),
    }))
    .filter((rationale) => {
      if (rationale.prose.length === 0 || !nodeIds.has(rationale.nodeId)) return false;
      if (seenNodes.has(rationale.nodeId)) return false;
      seenNodes.add(rationale.nodeId);
      return true;
    })
    .slice(0, NARRATION_MAX_COMPONENT_RATIONALES);

  const seenCriteria = new Set<string>();
  const criterionNarrations = narrations
    .map((narration) => ({
      criterionId: narration.criterionId,
      prose: narration.prose.trim().slice(0, NARRATION_PROSE_MAX_LENGTH),
    }))
    .filter((narration) => {
      if (narration.prose.length === 0 || !criterionIds.has(narration.criterionId)) return false;
      if (seenCriteria.has(narration.criterionId)) return false;
      seenCriteria.add(narration.criterionId);
      return true;
    })
    .slice(0, NARRATION_MAX_CRITERION_NARRATIONS);

  const trimmedOverview = overview.trim().slice(0, NARRATION_OVERVIEW_MAX_LENGTH);

  if (
    trimmedOverview.length === 0 &&
    componentRationales.length === 0 &&
    criterionNarrations.length === 0
  ) {
    return null;
  }

  return {
    version: NARRATION_VERSION,
    ...(trimmedOverview.length > 0 ? { overview: trimmedOverview } : {}),
    componentRationales,
    criterionNarrations,
  };
}
