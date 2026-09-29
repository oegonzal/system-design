import type { CriterionRef } from './brief-validator';
import type { CanvasGraph, DesignNarrative } from './canvas.schema';

/**
 * Referential validation of a narrative whose *shape* already passed the
 * schema. Pure and total, like `validateBriefReferences` — every problem in
 * one 422 rather than one per round trip.
 *
 * The same line the brief validator holds: it rejects what is IMPOSSIBLE — a
 * rationale for a node that is not on the canvas, a narration for a criterion
 * the prompt never derived — and says nothing about prose that is merely
 * thin. A two-word rationale is a save that grades poorly, not a save the API
 * refuses; refusing it would move the teaching out of the evaluation and into
 * a form validator.
 */
export function validateNarration(
  graph: CanvasGraph,
  narrative: DesignNarrative,
  criteria: readonly CriterionRef[],
): string[] {
  const problems: string[] = [];

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const seenNodes = new Set<string>();
  for (const rationale of narrative.componentRationales) {
    if (!nodeIds.has(rationale.nodeId)) {
      problems.push(`narrative explains unknown node: ${rationale.nodeId}`);
      continue;
    }
    if (seenNodes.has(rationale.nodeId)) {
      problems.push(`narrative explains node ${rationale.nodeId} twice`);
    }
    seenNodes.add(rationale.nodeId);
  }

  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  const seenCriteria = new Set<string>();
  for (const narration of narrative.criterionNarrations) {
    if (!criterionIds.has(narration.criterionId)) {
      problems.push(`narrative narrates unknown criterion: ${narration.criterionId}`);
      continue;
    }
    if (seenCriteria.has(narration.criterionId)) {
      problems.push(`narrative narrates criterion ${narration.criterionId} twice`);
    }
    seenCriteria.add(narration.criterionId);
  }

  return problems;
}
