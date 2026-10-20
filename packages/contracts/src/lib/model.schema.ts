import { z } from 'zod';

import { bounded } from './bounds';
import {
  CANVAS_ID_MAX_LENGTH,
  ENTITY_FIELDS_BOUND,
  ENTITY_INVARIANTS_BOUND,
  ENTITY_NAME_BOUND,
  ENTITY_NOTE_BOUND,
  ENTITY_STATES_BOUND,
  MODEL_ENTITIES_BOUND,
  MODEL_RELATIONS_BOUND,
} from './canvas';

/**
 * The data model beside the diagram: the entities the design keeps — each
 * with the node that owns it, its key, its fields, the invariants it holds
 * and the lifecycle states it moves through — and how they relate. Its own
 * part rather than nodes on the canvas, because a binding's path is a walk
 * over request edges and an entity's relations are not requests; the lenses
 * read it as `[entity.N]` lines beside the nodes, and a binding may name
 * the entities that hold a requirement as well as the nodes. Every bound is
 * declared through `bounded`, the way the canvas schema's are, and only the
 * ids and names other parts reference carry `.min(1)`.
 */

const modelId = (description?: string) => bounded.id(CANVAS_ID_MAX_LENGTH, { min: 1, description });

/** How one entity relates to another, declared so a reader never parses a note for it. */
export const RELATION_KINDS = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
  'references',
  'contains',
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export const modelEntityFieldSchema = z.strictObject({
  name: bounded.text(ENTITY_NAME_BOUND, { min: 1 }),
  note: bounded
    .text(ENTITY_NOTE_BOUND, { description: 'Type, meaning or rule, in a few words.' })
    .optional(),
});

export const modelEntitySchema = z.strictObject({
  id: modelId(),
  name: bounded.text(ENTITY_NAME_BOUND, { min: 1 }),
  ownerNodeId: bounded
    .id(CANVAS_ID_MAX_LENGTH, {
      min: 1,
      description: 'The node that is the system of record for this entity, existing ids only.',
    })
    .optional(),
  key: bounded
    .text(ENTITY_NOTE_BOUND, {
      description: 'What identifies one instance: the primary key or natural key.',
    })
    .optional(),
  fields: bounded.list(ENTITY_FIELDS_BOUND, modelEntityFieldSchema),
  invariants: bounded.list(ENTITY_INVARIANTS_BOUND, bounded.text(ENTITY_NOTE_BOUND, { min: 1 }), {
    description: 'Rules that must hold for every instance, one sentence each.',
  }),
  states: bounded.list(ENTITY_STATES_BOUND, bounded.text(ENTITY_NAME_BOUND, { min: 1 }), {
    description:
      'The lifecycle states an instance moves through, in order, when it has a lifecycle.',
  }),
});
export type ModelEntity = z.infer<typeof modelEntitySchema>;

export const modelRelationSchema = z.strictObject({
  from: modelId(),
  to: modelId(),
  kind: z.enum(RELATION_KINDS),
  note: bounded.text(ENTITY_NOTE_BOUND).optional(),
});
export type ModelRelation = z.infer<typeof modelRelationSchema>;

export const DESIGN_MODEL_VERSION = 1;

export const designModelSchema = z.strictObject({
  version: z.literal(DESIGN_MODEL_VERSION),
  entities: bounded.list(MODEL_ENTITIES_BOUND, modelEntitySchema, {
    description: 'Every entity the design keeps, each id distinct.',
  }),
  relations: bounded.list(MODEL_RELATIONS_BOUND, modelRelationSchema, {
    description: 'Relations between entities listed above, by their ids.',
  }),
});
export type DesignModel = z.infer<typeof designModelSchema>;

/** An entity as it sits in the editor: a row whose name or a field's name is not typed yet is fine. */
export const modelEntityDraftSchema = modelEntitySchema.extend({
  name: bounded.text(ENTITY_NAME_BOUND),
  fields: bounded.list(
    ENTITY_FIELDS_BOUND,
    modelEntityFieldSchema.extend({ name: bounded.text(ENTITY_NAME_BOUND) }),
  ),
  invariants: bounded.list(ENTITY_INVARIANTS_BOUND, bounded.text(ENTITY_NOTE_BOUND)),
  states: bounded.list(ENTITY_STATES_BOUND, bounded.text(ENTITY_NAME_BOUND)),
});

export const designModelDraftSchema = designModelSchema.extend({
  entities: bounded.list(MODEL_ENTITIES_BOUND, modelEntityDraftSchema),
});
