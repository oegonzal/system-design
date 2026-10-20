import {
  ENTITY_FIELDS_BOUND,
  ENTITY_INVARIANTS_BOUND,
  ENTITY_STATES_BOUND,
  MODEL_ENTITIES_BOUND,
  MODEL_RELATIONS_BOUND,
} from './canvas';
import type { CanvasGraph } from './canvas.schema';
import {
  DESIGN_MODEL_VERSION,
  type DesignModel,
  type ModelEntity,
  type ModelRelation,
} from './model.schema';

/**
 * The repair of a model — the drop-side twin of `validateModelReferences`,
 * and the sibling of `reconcileBrief`. An entity with no name decided
 * nothing and is dropped; a second entity with an id already taken is a
 * duplicate; an owner the canvas no longer has is forgotten while the entity
 * stays; a relation to an entity that is not there is dropped. Thinness is
 * never judged here. Text is trimmed, never cut; lists are cut at what the
 * schema accepts, a bound's ceiling.
 */
export function reconcileModel(
  entities: readonly ModelEntity[],
  relations: readonly ModelRelation[],
  graph: CanvasGraph,
): DesignModel | null {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const optional = (text: string | undefined): string | undefined => {
    const trimmed = text?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const seen = new Set<string>();
  const kept: ModelEntity[] = [];
  for (const entity of entities) {
    const name = entity.name.trim();
    if (name.length === 0 || seen.has(entity.id)) continue;
    seen.add(entity.id);
    const owner =
      entity.ownerNodeId !== undefined && nodeIds.has(entity.ownerNodeId)
        ? entity.ownerNodeId
        : undefined;
    const key = optional(entity.key);
    kept.push({
      id: entity.id,
      name,
      ...(owner !== undefined ? { ownerNodeId: owner } : {}),
      ...(key !== undefined ? { key } : {}),
      fields: entity.fields
        .map((field) => {
          const note = optional(field.note);
          return { name: field.name.trim(), ...(note !== undefined ? { note } : {}) };
        })
        .filter((field) => field.name.length > 0)
        .slice(0, ENTITY_FIELDS_BOUND.ceiling),
      invariants: entity.invariants
        .map((text) => text.trim())
        .filter((text) => text.length > 0)
        .slice(0, ENTITY_INVARIANTS_BOUND.ceiling),
      states: entity.states
        .map((text) => text.trim())
        .filter((text) => text.length > 0)
        .slice(0, ENTITY_STATES_BOUND.ceiling),
    });
    if (kept.length >= MODEL_ENTITIES_BOUND.ceiling) break;
  }
  if (kept.length === 0) return null;
  const keptRelations: ModelRelation[] = relations
    .filter((relation) => seen.has(relation.from) && seen.has(relation.to))
    .map((relation) => {
      const note = optional(relation.note);
      return {
        from: relation.from,
        to: relation.to,
        kind: relation.kind,
        ...(note !== undefined ? { note } : {}),
      };
    })
    .slice(0, MODEL_RELATIONS_BOUND.ceiling);
  return { version: DESIGN_MODEL_VERSION, entities: kept, relations: keptRelations };
}
