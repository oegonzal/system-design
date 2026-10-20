import type { CanvasGraph, DesignBrief } from './canvas.schema';
import type { DesignModel } from './model.schema';

/** The rubric a brief must line up with — the prompt's criteria, by id. */
export interface CriterionRef {
  id: string;
}

/**
 * Referential validation of a brief whose *shape* already passed the schema.
 * Pure and total, like `validateGraphReferences` — every problem in one 422
 * rather than one per round trip.
 *
 * The line this file must hold: it rejects claims that are IMPOSSIBLE (a
 * criterion the prompt never derived, a node that is not on the canvas, a
 * path that does not connect) and says nothing about claims that are merely
 * UNSUPPORTED. "You bound availability to a database with no replica" is a
 * grade, not a save blocker — if the API refused it, the API would be doing
 * the teaching, and the author would never see the finding that explains why.
 */
export function validateBriefReferences(
  graph: CanvasGraph,
  brief: DesignBrief,
  criteria: readonly CriterionRef[],
  model: DesignModel | null = null,
): string[] {
  const problems: string[] = [];

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const entityIds = new Set((model?.entities ?? []).map((entity) => entity.id));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));

  const bound = new Set<string>();
  for (const binding of brief.bindings) {
    if (!criterionIds.has(binding.criterionId)) {
      problems.push(`binding references unknown criterion: ${binding.criterionId}`);
    }
    if (bound.has(binding.criterionId)) {
      problems.push(`criterion ${binding.criterionId} is bound twice`);
    }
    bound.add(binding.criterionId);

    const seenNodes = new Set<string>();
    for (const nodeId of binding.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        problems.push(`binding of ${binding.criterionId} references unknown node: ${nodeId}`);
        continue;
      }
      if (seenNodes.has(nodeId)) {
        problems.push(`binding of ${binding.criterionId} lists node ${nodeId} twice`);
      }
      seenNodes.add(nodeId);
    }

    for (const entityId of binding.entityIds ?? []) {
      if (!entityIds.has(entityId)) {
        problems.push(`binding of ${binding.criterionId} references unknown entity: ${entityId}`);
      }
    }

    // A walk, not a bag of edges: each hop must start where the last one ended.
    let previousTarget: string | null = null;
    for (const edgeId of binding.path ?? []) {
      const edge = edgeById.get(edgeId);
      if (edge === undefined) {
        problems.push(`path of ${binding.criterionId} references unknown edge: ${edgeId}`);
        previousTarget = null;
        continue;
      }
      if (previousTarget !== null && edge.source !== previousTarget) {
        problems.push(
          `path of ${binding.criterionId} breaks at edge ${edgeId} — it does not continue the walk`,
        );
      }
      previousTarget = edge.target;
    }
  }

  return problems;
}
