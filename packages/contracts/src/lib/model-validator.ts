import type { CanvasGraph } from './canvas.schema';
import type { DesignModel } from './model.schema';

/**
 * Referential validation of a model whose *shape* already passed the schema.
 * Pure and total, like `validateBriefReferences` — every problem in one 422
 * rather than one per round trip. It rejects what is IMPOSSIBLE — an entity
 * declared twice, a relation between entities that are not there, an owner
 * that is not drawn — and says nothing about a model that is merely thin:
 * whether the entities are the right ones is the model critic's call.
 */
export function validateModelReferences(graph: CanvasGraph, model: DesignModel): string[] {
  const problems: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const entityIds = new Set<string>();
  for (const entity of model.entities) {
    if (entityIds.has(entity.id)) problems.push(`model declares entity ${entity.id} twice`);
    entityIds.add(entity.id);
    if (entity.ownerNodeId !== undefined && !nodeIds.has(entity.ownerNodeId)) {
      problems.push(`entity ${entity.id} is owned by unknown node: ${entity.ownerNodeId}`);
    }
  }
  model.relations.forEach((relation, index) => {
    for (const end of [relation.from, relation.to]) {
      if (!entityIds.has(end)) {
        problems.push(`relation ${index + 1} references unknown entity: ${end}`);
      }
    }
  });
  return problems;
}
