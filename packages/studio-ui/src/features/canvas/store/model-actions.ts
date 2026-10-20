import type { ModelEntity, ModelRelation } from '@sysdesign/contracts';

import type { ActionDeps } from './history';
import type { CanvasState } from './state';

export type ModelActions = Pick<
  CanvasState,
  | 'addEntity'
  | 'updateEntity'
  | 'removeEntity'
  | 'addRelation'
  | 'updateRelation'
  | 'removeRelation'
>;

/** The next free entity id, `ent-N`, so an author never types an identifier. */
function nextEntityId(entities: readonly ModelEntity[]): string {
  const taken = new Set(entities.map((entity) => entity.id));
  let n = entities.length + 1;
  while (taken.has(`ent-${n}`)) n += 1;
  return `ent-${n}`;
}

/**
 * The data model the author writes beside the diagram: entities with their
 * owner, key, fields, invariants and states, and the relations between them.
 * Orthogonal to the graph like the brief and the narrative: deleting a node
 * never rewrites an entity's owner here — `reconcileModel` forgets an owner
 * the canvas no longer has when the model becomes a payload.
 */
export const modelActions = ({ get, edits: { commit } }: ActionDeps): ModelActions => ({
  addEntity() {
    const { entities } = get();
    commit({
      entities: [
        ...entities,
        { id: nextEntityId(entities), name: '', fields: [], invariants: [], states: [] },
      ],
    });
  },

  updateEntity(id, patch) {
    const { entities } = get();
    const current = entities.find((entity) => entity.id === id);
    if (current === undefined) return;
    const next: ModelEntity = { ...current, ...patch };
    // An optional slot set blank is cleared, not stored empty.
    if (next.ownerNodeId !== undefined && next.ownerNodeId.length === 0) delete next.ownerNodeId;
    if (next.key !== undefined && next.key.trim().length === 0) delete next.key;
    commit(
      { entities: entities.map((entity) => (entity.id === id ? next : entity)) },
      `model:entity:${id}:${Object.keys(patch).join(',')}`,
    );
  },

  removeEntity(id) {
    const { entities, relations } = get();
    if (!entities.some((entity) => entity.id === id)) return;
    commit({
      entities: entities.filter((entity) => entity.id !== id),
      relations: relations.filter((relation) => relation.from !== id && relation.to !== id),
    });
  },

  addRelation(relation) {
    commit({ relations: [...get().relations, relation] });
  },

  updateRelation(index, patch) {
    const { relations } = get();
    const current = relations[index];
    if (current === undefined) return;
    const next: ModelRelation = { ...current, ...patch };
    if (next.note !== undefined && next.note.trim().length === 0) delete next.note;
    commit(
      { relations: relations.map((relation, at) => (at === index ? next : relation)) },
      `model:relation:${index}:${Object.keys(patch).join(',')}`,
    );
  },

  removeRelation(index) {
    const { relations } = get();
    if (relations[index] === undefined) return;
    commit({ relations: relations.filter((_, at) => at !== index) });
  },
});
