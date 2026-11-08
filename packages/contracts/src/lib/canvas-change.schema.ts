import { z } from 'zod';

import { bounded, type Bound } from './bounds';
import {
  ASSUMPTION_BOUND,
  BRIEF_BINDINGS_BOUND,
  CHANGE_EDGE_UPSERTS_BOUND,
  CHANGE_NODE_UPSERTS_BOUND,
  CHANGE_REMOVALS_BOUND,
  MODEL_ENTITIES_BOUND,
  MODEL_RELATIONS_BOUND,
  NARRATION_COMPONENT_RATIONALES_BOUND,
  NARRATION_CRITERION_NARRATIONS_BOUND,
  NARRATION_OVERVIEW_BOUND,
  NARRATIVE_ASSUMPTIONS_BOUND,
  NARRATIVE_DECISIONS_BOUND,
} from './canvas';
import {
  bindingSchema,
  CANVAS_RULES,
  canvasEdgeSchema,
  canvasIdSchema,
  canvasNodeSchema,
  componentRationaleSchema,
  criterionIdSchema,
  criterionNarrationSchema,
  designDecisionSchema,
} from './canvas.schema';
import { modelEntitySchema, modelRelationSchema } from './model.schema';

/**
 * What the coach returns on a revise: only what changes against the artifact
 * it was shown, never the whole artifact again. Measured on chain 4
 * (session 2681e7b0, 2026-11-07): a whole-canvas redraw restated 34–64% of
 * an 82–120 KB reply unchanged and rewrote 22–31 of 34 bindings a round, so
 * the parts nobody criticised were re-rolled. The loop applies a change set
 * to the best (`applyCanvasChange`) and judges the result; nothing
 * downstream ever sees a change set.
 *
 * One strict root with the one required key `changes`: the fake model the
 * loop's specs use answers with the first canned object that parses
 * leniently, unknown keys stripped, so a whole submission must not read as
 * an empty change, nor a change set as a submission. One list per operation
 * and no union of objects anywhere, since the bound measurer reads a union's
 * first branch. Every sub-object is optional and shown to the model as
 * required and nullable (`modelSchema`): null or absent means unchanged.
 * The element schemas and the bound constants are the submission's own, so
 * a node in a change set is exactly a node on the canvas; the three list
 * bounds the change set adds are sized in `canvas.ts`.
 */

/** Said once for every list the change set replaces whole rather than edits by key. */
const REPLACE_WHOLE =
  'The whole list as it should read after the change — include every one you keep; an empty list removes them all; omit to leave them as they are.';

interface ListSpec<Item extends z.ZodType> {
  bound: Bound;
  item: Item;
  description: string;
}

/** A list edited by whole items: what is added or rewritten by its key, and the keys removed. */
const keyedChanges = <Item extends z.ZodType, Key extends z.ZodType>(
  upsert: ListSpec<Item>,
  remove: ListSpec<Key>,
) =>
  z
    .strictObject({
      upsert: bounded.list(upsert.bound, upsert.item, { description: upsert.description }),
      remove: bounded.list(remove.bound, remove.item, { description: remove.description }),
    })
    .optional();

/** A positional list, replaced whole when named. */
const replacedWhole = <Item extends z.ZodType>(bound: Bound, item: Item) =>
  z.strictObject({ replace: bounded.list(bound, item, { description: REPLACE_WHOLE }) }).optional();

export const canvasChangeSchema = z.strictObject({
  changes: z
    .strictObject({
      nodes: keyedChanges(
        {
          bound: CHANGE_NODE_UPSERTS_BOUND,
          item: canvasNodeSchema,
          description: `Nodes to add or rewrite, whole, by id: an existing id replaces the node in place and keeps its position when you omit one; a new id, starting with ai-, is appended. ${CANVAS_RULES.distinctNodes}`,
        },
        {
          bound: CHANGE_REMOVALS_BOUND,
          item: canvasIdSchema,
          description:
            'Node ids to remove; every edge touching a removed node goes with it, including one in this change set; an id not on the canvas is ignored.',
        },
      ),
      edges: keyedChanges(
        {
          bound: CHANGE_EDGE_UPSERTS_BOUND,
          item: canvasEdgeSchema,
          description: `Edges to add or rewrite, whole, by id: an existing id replaces the edge in place; a new id, starting with ai-, is appended. ${CANVAS_RULES.distinctEdges}`,
        },
        {
          bound: CHANGE_REMOVALS_BOUND,
          item: canvasIdSchema,
          description: 'Edge ids to remove; an id not on the canvas is ignored.',
        },
      ),
      entities: keyedChanges(
        {
          bound: MODEL_ENTITIES_BOUND,
          item: modelEntitySchema,
          description:
            'Entities to add or rewrite, whole, by id: an existing id replaces the entity in place; a new id is appended.',
        },
        {
          bound: MODEL_ENTITIES_BOUND,
          item: canvasIdSchema,
          description: 'Entity ids to remove; an id not in the model is ignored.',
        },
      ),
      relations: replacedWhole(MODEL_RELATIONS_BOUND, modelRelationSchema),
      bindings: keyedChanges(
        {
          bound: BRIEF_BINDINGS_BOUND,
          item: bindingSchema,
          description: `Bindings to add or rewrite, whole, by criterion id; a later entry for the same criterion wins. ${CANVAS_RULES.oneBindingPerCriterion}`,
        },
        {
          bound: BRIEF_BINDINGS_BOUND,
          item: criterionIdSchema,
          description: 'Criterion ids whose binding is removed; one not bound is ignored.',
        },
      ),
      rationales: keyedChanges(
        {
          bound: NARRATION_COMPONENT_RATIONALES_BOUND,
          item: componentRationaleSchema,
          description:
            'Component rationales to add or rewrite, whole, by node id; a later entry for the same node wins.',
        },
        {
          bound: NARRATION_COMPONENT_RATIONALES_BOUND,
          item: canvasIdSchema,
          description: 'Node ids whose rationale is removed; one without a rationale is ignored.',
        },
      ),
      narrations: keyedChanges(
        {
          bound: NARRATION_CRITERION_NARRATIONS_BOUND,
          item: criterionNarrationSchema,
          description:
            'Criterion narrations to add or rewrite, whole, by criterion id; a later entry for the same criterion wins.',
        },
        {
          bound: NARRATION_CRITERION_NARRATIONS_BOUND,
          item: criterionIdSchema,
          description:
            'Criterion ids whose narration is removed; one without a narration is ignored.',
        },
      ),
      decisions: replacedWhole(NARRATIVE_DECISIONS_BOUND, designDecisionSchema),
      assumptions: replacedWhole(
        NARRATIVE_ASSUMPTIONS_BOUND,
        bounded.text(ASSUMPTION_BOUND, { min: 1 }),
      ),
      overview: bounded
        .text(NARRATION_OVERVIEW_BOUND, {
          description:
            'The overview as it should read; omit to keep it; an empty string removes it.',
        })
        .optional(),
    })
    .describe('Only what changes. Everything you do not name stays exactly as it is.'),
});
export type CanvasChange = z.infer<typeof canvasChangeSchema>;
