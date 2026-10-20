import type { CriterionRef } from './brief-validator';
import {
  DECISION_NODES_BOUND,
  NARRATION_COMPONENT_RATIONALES_BOUND,
  NARRATION_CRITERION_NARRATIONS_BOUND,
  NARRATIVE_ASSUMPTIONS_BOUND,
  NARRATIVE_DECISIONS_BOUND,
} from './canvas';
import {
  NARRATION_VERSION,
  type CanvasGraph,
  type ComponentRationale,
  type CriterionNarration,
  type DesignDecision,
  type DesignNarrative,
} from './canvas.schema';

/**
 * The repair of a narrative — the drop-side twin of `validateNarration`, and
 * the prose sibling of `reconcileBrief`. A rationale for a node the canvas no
 * longer has and a narration for a criterion the rubric never listed are
 * dropped, exactly as a binding whose node was deleted is dropped. Thinness
 * is never judged here: whether a rationale explains anything is the
 * explanation critic's call; this only knows written from unwritten.
 *
 * Prose is trimmed, never cut: nothing is cut to fit. The editors bound each
 * slot with the schema's own declarations as `maxLength`, so prose past its
 * bound did not come from them, and it stays whole for the schema to keep or
 * refuse — a silent cut would send words the author never saw go missing.
 * Lists are cut at what the schema accepts, a bound's ceiling.
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
  decisions: readonly DesignDecision[] = [],
  assumptions: readonly string[] = [],
): DesignNarrative | null {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));

  const seenNodes = new Set<string>();
  const componentRationales = rationales
    .map((rationale) => {
      const tradeoff = rationale.tradeoff?.trim() ?? '';
      return {
        nodeId: rationale.nodeId,
        prose: rationale.prose.trim(),
        ...(tradeoff.length > 0 ? { tradeoff } : {}),
      };
    })
    .filter((rationale) => {
      const written = rationale.prose.length > 0 || rationale.tradeoff !== undefined;
      if (!written || !nodeIds.has(rationale.nodeId)) return false;
      if (seenNodes.has(rationale.nodeId)) return false;
      seenNodes.add(rationale.nodeId);
      return true;
    })
    .slice(0, NARRATION_COMPONENT_RATIONALES_BOUND.ceiling);

  // A decision with no choice typed decided nothing; one naming a node the
  // canvas no longer has keeps its words and loses the reference.
  const optional = (text: string | undefined): string | undefined => {
    const trimmed = text?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const kept: DesignDecision[] = decisions
    .map((decision) => {
      const nodes = [...new Set(decision.nodeIds ?? [])]
        .filter((id) => nodeIds.has(id))
        .slice(0, DECISION_NODES_BOUND.ceiling);
      const alternative = optional(decision.alternative);
      const cost = optional(decision.cost);
      const reconsiderWhen = optional(decision.reconsiderWhen);
      return {
        choice: decision.choice.trim(),
        ...(alternative !== undefined ? { alternative } : {}),
        ...(cost !== undefined ? { cost } : {}),
        ...(reconsiderWhen !== undefined ? { reconsiderWhen } : {}),
        ...(nodes.length > 0 ? { nodeIds: nodes } : {}),
      };
    })
    .filter((decision) => decision.choice.length > 0)
    .slice(0, NARRATIVE_DECISIONS_BOUND.ceiling);

  const seenCriteria = new Set<string>();
  const criterionNarrations = narrations
    .map((narration) => ({
      criterionId: narration.criterionId,
      prose: narration.prose.trim(),
    }))
    .filter((narration) => {
      if (narration.prose.length === 0 || !criterionIds.has(narration.criterionId)) return false;
      if (seenCriteria.has(narration.criterionId)) return false;
      seenCriteria.add(narration.criterionId);
      return true;
    })
    .slice(0, NARRATION_CRITERION_NARRATIONS_BOUND.ceiling);

  const keptAssumptions = assumptions
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .slice(0, NARRATIVE_ASSUMPTIONS_BOUND.ceiling);

  const trimmedOverview = overview.trim();

  if (
    trimmedOverview.length === 0 &&
    componentRationales.length === 0 &&
    criterionNarrations.length === 0 &&
    kept.length === 0 &&
    keptAssumptions.length === 0
  ) {
    return null;
  }

  return {
    version: NARRATION_VERSION,
    ...(trimmedOverview.length > 0 ? { overview: trimmedOverview } : {}),
    componentRationales,
    criterionNarrations,
    ...(kept.length > 0 ? { decisions: kept } : {}),
    ...(keptAssumptions.length > 0 ? { assumptions: keptAssumptions } : {}),
  };
}
