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
 * Three rules follow the first change-set rounds (arm C, lane run
 * 2026-11-08T22-48-49-342-e4eb2d, 23:40Z), where every slip cost the round.
 * An element is ADDRESSED by the author's id or by the position the render
 * printed — the coach copied `node.14` off `[node.14] node n-14 …` as an id,
 * and the round appended phantom nodes; now `node.14` is the 14th node.
 * The applied graph is WIRED — an edge whose carries "neither n-13 nor
 * node.14 declares" scored the round 0 through the `references` validator;
 * now the carry goes and the edge stays, as every rule in
 * `canvas-change.graph.ts` keeps the work and drops the slip. And the
 * decisions and assumptions are edited by POSITION — the coach replaced all
 * 20 decisions in both rounds with 3 of 20 identical, and the reasoning
 * dimension fell 60 → 40 as the narrative was re-rolled; now one decision
 * changes and the rest stay word for word. Relations, which the render
 * numbers nowhere, are still replaced whole.
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

/** How a drawn element is addressed, said once for every field that addresses one. */
const BY_ID_OR_POSITION =
  "by the author's id or by the position the artifact above shows ([node.14] means the 14th node, [edge.3] the 3rd edge, [entity.2] the 2nd entity)";

const addressRule = (part: 'node' | 'edge', example: string): string =>
  `Address a${part === 'edge' ? 'n' : ''} ${part} by the author's id (${example}, ai-…) or by the position the artifact above shows ([${part}.14] means the 14th ${part}); a new ${part} must carry a new id starting with ai-.`;

/**
 * What the applied graph does with a reference slip, so the coach knows
 * nothing it writes voids a round. The repeated-hop rule is scoped to a NEW
 * edge because that is the apply's scope (`canvas-change.graph.ts`): only an
 * unknown id is folded onto the edge it repeats, and only onto one this
 * change set keeps. Probed 2026-11-08 on the fixture best: `e-1` rewired by
 * its own id onto `e-2`'s hop keeps both — the loop's structure rule reads
 * two edges on one hop as a medium finding, never a refusal — and a new edge
 * drawn beside `remove: ['e-2']` on that hop is the replacement, under its
 * own id. The text says what the apply does, no more.
 */
const WIRED_EDGES =
  'An edge whose endpoint does not exist, or a carried operation no endpoint declares, is dropped; so is an edge joining a node to itself. A new edge that repeats an existing source → target of the same kind replaces that edge and keeps its id, unless this change set removes that edge; an existing edge you rewire by its own id stays its own edge, even beside one it then repeats.';

/** Said once for every list the change set replaces whole rather than edits by key. */
const REPLACE_WHOLE =
  'The whole list as it should read after the change — include every one you keep; an empty list removes them all; omit to leave them as they are.';

const indexedRule = (noun: string): string =>
  `Change one ${noun} by its position; untouched ${noun}s stay exactly as they are. Only replace what a remediation names.`;

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

/**
 * A 1-based position in the list as the artifact numbers it. An integer and
 * nothing more: a position the list does not have is ignored when applied,
 * never a fault that refuses the reply.
 */
const positionSchema = (part: 'decision' | 'assumption') =>
  z.number().int().describe(`The 1-based position in the artifact above: [${part}.N] is N.`);

/**
 * A list whose items have no key of their own, edited by position: items
 * rewritten where they stand, positions removed, items appended. Every
 * position is the artifact's, read before any removal shifts a thing.
 */
const indexedChanges = <At extends z.ZodType, Item extends z.ZodType>(
  noun: 'decision' | 'assumption',
  bound: Bound,
  upsertAt: At,
  append: Item,
) =>
  z
    .strictObject({
      upsertAt: bounded.list(bound, upsertAt, {
        description: `${indexedRule(noun)} Each entry rewrites the ${noun} at its position, whole; a later entry for one position wins.`,
      }),
      removeAt: bounded.list(CHANGE_REMOVALS_BOUND, positionSchema(noun), {
        description: `Positions to remove, as the artifact numbers them; the positions above are read before any removal, so they never shift.`,
      }),
      append: bounded.list(bound, append, {
        description: `New ${noun}s, added after the ones kept.`,
      }),
    })
    .optional();

const decisionAtSchema = z.strictObject({
  at: positionSchema('decision'),
  decision: designDecisionSchema,
});

const assumptionAtSchema = z.strictObject({
  at: positionSchema('assumption'),
  text: bounded.text(ASSUMPTION_BOUND, { min: 1 }),
});

export const canvasChangeSchema = z.strictObject({
  changes: z
    .strictObject({
      nodes: keyedChanges(
        {
          bound: CHANGE_NODE_UPSERTS_BOUND,
          item: canvasNodeSchema,
          description: `Nodes to add or rewrite, whole. ${addressRule('node', 'n-3')} An existing node is replaced in place and keeps its position when you omit one; a new one is appended. ${CANVAS_RULES.distinctNodes}`,
        },
        {
          bound: CHANGE_REMOVALS_BOUND,
          item: canvasIdSchema,
          description: `Nodes to remove, each ${BY_ID_OR_POSITION}; every edge touching a removed node goes with it, including one in this change set; one not on the canvas is ignored.`,
        },
      ),
      edges: keyedChanges(
        {
          bound: CHANGE_EDGE_UPSERTS_BOUND,
          item: canvasEdgeSchema,
          description: `Edges to add or rewrite, whole. ${addressRule('edge', 'e-3')} Its source and target name nodes ${BY_ID_OR_POSITION}. ${WIRED_EDGES} ${CANVAS_RULES.distinctEdges}`,
        },
        {
          bound: CHANGE_REMOVALS_BOUND,
          item: canvasIdSchema,
          description: `Edges to remove, each ${BY_ID_OR_POSITION}; one not on the canvas is ignored.`,
        },
      ),
      entities: keyedChanges(
        {
          bound: MODEL_ENTITIES_BOUND,
          item: modelEntitySchema,
          description: `Entities to add or rewrite, whole, each addressed ${BY_ID_OR_POSITION}; an existing entity is replaced in place, a new one appended under a new id; its ownerNodeId names a node the same way.`,
        },
        {
          bound: MODEL_ENTITIES_BOUND,
          item: canvasIdSchema,
          description: `Entities to remove, each ${BY_ID_OR_POSITION}; one not in the model is ignored.`,
        },
      ),
      relations: replacedWhole(MODEL_RELATIONS_BOUND, modelRelationSchema),
      bindings: keyedChanges(
        {
          bound: BRIEF_BINDINGS_BOUND,
          item: bindingSchema,
          description: `Bindings to add or rewrite, whole, by criterion id; a later entry for the same criterion wins. Its nodeIds, path and entityIds name nodes, edges and entities ${BY_ID_OR_POSITION}. ${CANVAS_RULES.oneBindingPerCriterion}`,
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
          description: `Component rationales to add or rewrite, whole, by node — named ${BY_ID_OR_POSITION}; a later entry for the same node wins.`,
        },
        {
          bound: NARRATION_COMPONENT_RATIONALES_BOUND,
          item: canvasIdSchema,
          description: `Nodes whose rationale is removed, each ${BY_ID_OR_POSITION}; one without a rationale is ignored.`,
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
      decisions: indexedChanges(
        'decision',
        NARRATIVE_DECISIONS_BOUND,
        decisionAtSchema,
        designDecisionSchema,
      ),
      assumptions: indexedChanges(
        'assumption',
        NARRATIVE_ASSUMPTIONS_BOUND,
        assumptionAtSchema,
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
