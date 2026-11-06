import { z } from 'zod';

import { bounded } from './bounds';
import {
  ASSUMPTION_BOUND,
  BINDING_CLAIM_BOUND,
  BINDING_ENTITIES_BOUND,
  BINDING_NODES_BOUND,
  BINDING_TRADEOFF_BOUND,
  BRIEF_BINDINGS_BOUND,
  CANVAS_EDGES_BOUND,
  CANVAS_ID_MAX_LENGTH,
  CANVAS_MAX_TOTAL_OPERATIONS,
  CANVAS_NODES_BOUND,
  CONFIG_KEY_MAX_LENGTH,
  CONFIG_STRING_VALUE_BOUND,
  DECISION_NODES_BOUND,
  DECISION_TEXT_BOUND,
  EDGE_CARRIES_BOUND,
  EDGE_CONFIG_HINTS,
  EDGE_CONFIG_KEYS_BOUND,
  EDGE_KINDS,
  EDGE_LABEL_BOUND,
  FLOW_STEPS_BOUND,
  NARRATION_COMPONENT_RATIONALES_BOUND,
  NARRATION_CRITERION_NARRATIONS_BOUND,
  NARRATION_OVERVIEW_BOUND,
  NARRATION_PROSE_BOUND,
  NARRATIVE_ASSUMPTIONS_BOUND,
  NARRATIVE_DECISIONS_BOUND,
  NODE_CONFIG_KEYS_BOUND,
  NODE_KINDS,
  NODE_BOUNDARY_BOUND,
  NODE_LABEL_BOUND,
  NODE_OPERATIONS_BOUND,
  NODE_RESPONSIBILITIES_BOUND,
  OPERATION_KINDS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_BOUND,
  RESPONSIBILITY_BOUND,
} from './canvas';
import { designModelDraftSchema, designModelSchema } from './model.schema';
import { ALL_PLATFORM_SERVICE_IDS, PLATFORM_SECTION_HEADING } from './platforms';
import { designTranscriptSchema } from './transcript.schema';
import { CRITERION_ID_MAX_LENGTH } from './quality-loop/evidence';

/**
 * The one definition of a design submission — diagram, brief and narrative.
 *
 * Every side parses it: the studio API validates what the canvas submits, the
 * quality loop's canvas pipeline declares it as the artifact its lenses judge
 * and its coach revises, and the canvas UI types its store from it. One schema
 * means one shape; there is no DTO class or hand-written interface to drift.
 *
 * Every bound is declared through `bounded` and `.min(1)` is only on the
 * things other parts reference (ids, a binding's components, a claim). The
 * model is asked for each bound's target and the schema accepts its ceiling;
 * past that the parse keeps prose whole and trims a list by whole items, so
 * a string a little over is never a lost revision — while an empty string
 * the coach should not have emitted cannot be repaired, so the schema asks
 * for as little as it can. `description`s are read by the coach, which
 * writes into this schema.
 */

const canvasId = (description?: string) =>
  bounded.id(CANVAS_ID_MAX_LENGTH, { min: 1, description });
const criterionId = () => bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 });

/** A config value is a scalar the author typed: text, a number or a flag. */
export const configValueSchema = z.union([
  bounded.text(CONFIG_STRING_VALUE_BOUND),
  z.number(),
  z.boolean(),
]);
export type ConfigValue = z.infer<typeof configValueSchema>;

/**
 * Free-form configuration, one entry per key, on a node or on an edge. A
 * list rather than a record so the same schema serves a model on every route
 * — a JSON-schema record loses its keys under structured output, a list does
 * not.
 */
export const configEntrySchema = z.strictObject({
  key: bounded.id(CONFIG_KEY_MAX_LENGTH, { min: 1 }),
  value: configValueSchema,
});
export type ConfigEntry = z.infer<typeof configEntrySchema>;

/**
 * One entry in a node's declared interface: a `command` mutates, a `query`
 * reads, an `event` is a fact published after something happened, a `stream`
 * is a continuous flow. Names are matched exactly by an edge's `carries`.
 */
export const nodeOperationSchema = z.strictObject({
  name: bounded.id(OPERATION_NAME_MAX_LENGTH, { min: 1 }),
  kind: z.enum(OPERATION_KINDS).optional(),
  idempotent: z.boolean().optional(),
  notes: bounded.text(OPERATION_NOTES_BOUND).optional(),
});
export type NodeOperation = z.infer<typeof nodeOperationSchema>;

export const canvasNodeSchema = z.strictObject({
  id: canvasId("The author's id; keep it. A new node takes an id starting with `ai-`."),
  kind: z.enum(NODE_KINDS),
  /** The platform service the node is, when the goal declares a platform; `kind` is one of the roles the catalogue lists for it. */
  service: z
    .enum(ALL_PLATFORM_SERVICE_IDS)
    .optional()
    .describe(
      `The platform service this node is, by an id the goal's \`${PLATFORM_SECTION_HEADING}\` section lists; its kind must be one of the roles that section states for the service. Omit when the goal declares no platform.`,
    ),
  label: bounded.text(NODE_LABEL_BOUND),
  /** Where the block sits — a region, an account, a network, a subnet, a security group — in the platform's words. */
  boundary: bounded
    .text(NODE_BOUNDARY_BOUND, {
      description: `Where this block sits — a region, an account, a network, a subnet, a security group — as the goal's \`${PLATFORM_SECTION_HEADING}\` section names them under Boundaries; omit where placement is not the point.`,
    })
    .optional(),
  /** Canvas layout, so a stored revision re-renders where the author left it. */
  position: z
    .strictObject({ x: z.number(), y: z.number() })
    .optional()
    .describe('Omit for a new node; the studio lays it out.'),
  config: bounded
    .list(NODE_CONFIG_KEYS_BOUND, configEntrySchema, {
      description: 'One entry per key; a key set twice is refused.',
    })
    .optional(),
  /** Short role statements — "owns the order lifecycle", one clause each. */
  responsibilities: bounded
    .list(NODE_RESPONSIBILITIES_BOUND, bounded.text(RESPONSIBILITY_BOUND))
    .optional(),
  operations: bounded
    .list(NODE_OPERATIONS_BOUND, nodeOperationSchema, {
      description:
        "This node's declared interface. A name must be unique on the node, and an edge's `carries` matches it exactly.",
    })
    .optional(),
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasEdgeSchema = z.strictObject({
  id: canvasId("The author's id; keep it. A new edge takes an id starting with `ai-`."),
  source: canvasId(),
  target: canvasId(),
  /** A solid request/response call, or fire-and-forget messaging. */
  kind: z.enum(EDGE_KINDS),
  label: bounded.text(EDGE_LABEL_BOUND).optional(),
  /** How the hop is made and what happens when it fails, as free-form entries; the hints are suggestions, never a vocabulary. */
  config: bounded
    .list(EDGE_CONFIG_KEYS_BOUND, configEntrySchema, {
      description: `How this connection is made and what happens when it fails. One entry per key; a key set twice is refused. Suggested keys: ${EDGE_CONFIG_HINTS.join(', ')} — any key is accepted.`,
    })
    .optional(),
  /** Operation names this connection exercises — declared on its source or its target. */
  carries: bounded
    .list(EDGE_CARRIES_BOUND, bounded.id(OPERATION_NAME_MAX_LENGTH, { min: 1 }), {
      description:
        'Operation names this connection exercises, each declared on its source or its target, and none repeated.',
    })
    .optional(),
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

export const canvasGraphSchema = z.strictObject({
  nodes: bounded.list(CANVAS_NODES_BOUND, canvasNodeSchema, {
    // The budget is the one rule no bound can carry — it is a sum across nodes —
    // so it is stated here, interpolated, rather than left for the writer to be
    // refused by a number it was never shown.
    description: `Every node id is distinct, and all nodes together declare at most ${CANVAS_MAX_TOTAL_OPERATIONS} operations.`,
  }),
  edges: bounded.list(CANVAS_EDGES_BOUND, canvasEdgeSchema, {
    description: 'Every edge id is distinct, and no edge joins a node to itself.',
  }),
});
export type CanvasGraph = z.infer<typeof canvasGraphSchema>;

/**
 * How the design meets one success criterion: the components that hold it, a
 * short claim in the author's words, — where a request travels — the path of
 * edges it takes, and why this mechanism rather than another that could have
 * held it. One binding per criterion.
 */
export const bindingSchema = z.strictObject({
  criterionId: criterionId(),
  nodeIds: bounded.list(BINDING_NODES_BOUND, canvasId(), {
    min: 1,
    description: 'Every node that holds this criterion, existing ids only.',
  }),
  path: bounded
    .list(FLOW_STEPS_BOUND, canvasId(), {
      description:
        'One connected walk of existing edge ids, in order — each edge starts where the previous one ends. The single route a request takes, never every edge involved.',
    })
    .optional(),
  claim: bounded.text(BINDING_CLAIM_BOUND, { min: 1 }),
  entityIds: bounded
    .list(BINDING_ENTITIES_BOUND, canvasId(), {
      description: 'The entities of the model that hold this criterion, existing ids only.',
    })
    .optional(),
  tradeoff: bounded
    .text(BINDING_TRADEOFF_BOUND, {
      description:
        'Why this mechanism and not another that could hold the requirement: the alternative considered and the cost accepted with the choice.',
    })
    .optional(),
});
export type Binding = z.infer<typeof bindingSchema>;

export const DESIGN_BRIEF_VERSION = 1;

export const designBriefSchema = z.strictObject({
  version: z.literal(DESIGN_BRIEF_VERSION),
  bindings: bounded.list(BRIEF_BINDINGS_BOUND, bindingSchema, {
    description: 'At most one binding per criterion.',
  }),
});
export type DesignBrief = z.infer<typeof designBriefSchema>;

export const NARRATION_VERSION = 1;

export const componentRationaleSchema = z.strictObject({
  nodeId: canvasId(),
  prose: bounded.text(NARRATION_PROSE_BOUND),
  tradeoff: bounded
    .text(NARRATION_PROSE_BOUND, {
      description:
        'What could have stood here instead, and why it does not: the alternative considered and the cost of this component.',
    })
    .optional(),
});
export type ComponentRationale = z.infer<typeof componentRationaleSchema>;

/**
 * One decision the design rests on, told the way a senior engineer defends
 * it: what was chosen, what was not, what the choice costs, and what would
 * change it. Only the choice is required of the schema; a decision with no
 * alternative or no cost is accepted and graded, because that gap is the
 * lesson, not a reason to refuse the save.
 */
export const designDecisionSchema = z.strictObject({
  choice: bounded.text(DECISION_TEXT_BOUND, {
    min: 1,
    description: 'What was decided, in one sentence.',
  }),
  alternative: bounded
    .text(DECISION_TEXT_BOUND, { description: 'The other option considered, and what it offered.' })
    .optional(),
  cost: bounded
    .text(DECISION_TEXT_BOUND, {
      description: 'What the choice costs: what was given up or taken on.',
    })
    .optional(),
  reconsiderWhen: bounded
    .text(DECISION_TEXT_BOUND, {
      description: 'The condition under which the other option would win.',
    })
    .optional(),
  nodeIds: bounded
    .list(DECISION_NODES_BOUND, canvasId(), {
      description: 'The nodes the decision concerns, existing ids only.',
    })
    .optional(),
});
export type DesignDecision = z.infer<typeof designDecisionSchema>;

export const criterionNarrationSchema = z.strictObject({
  criterionId: criterionId(),
  prose: bounded.text(NARRATION_PROSE_BOUND),
});
export type CriterionNarration = z.infer<typeof criterionNarrationSchema>;

/**
 * The walkthrough: why each component is there and instead of what, how each
 * requirement is met, and the decisions the whole design rests on — keyed to
 * the node and criterion each explains rather than left as one free-text box.
 */
export const designNarrativeSchema = z.strictObject({
  version: z.literal(NARRATION_VERSION),
  overview: bounded.text(NARRATION_OVERVIEW_BOUND).optional(),
  componentRationales: bounded.list(NARRATION_COMPONENT_RATIONALES_BOUND, componentRationaleSchema),
  criterionNarrations: bounded.list(NARRATION_CRITERION_NARRATIONS_BOUND, criterionNarrationSchema),
  decisions: bounded
    .list(NARRATIVE_DECISIONS_BOUND, designDecisionSchema, {
      description:
        'The load-bearing decisions of the whole design — a store, a queue, a split into services, a synchronous call to an outside system — each with its alternative and its cost.',
    })
    .optional(),
  assumptions: bounded
    .list(NARRATIVE_ASSUMPTIONS_BOUND, bounded.text(ASSUMPTION_BOUND, { min: 1 }), {
      description:
        'What the design takes as given that the goal does not state, one sentence each — stated here rather than smuggled into a claim.',
    })
    .optional(),
});
export type DesignNarrative = z.infer<typeof designNarrativeSchema>;

/**
 * What the canvas submits and what the quality loop judges: one object. The
 * model is optional as well as nullable: revisions stored before it existed
 * carry none, and a reader treats absent as null.
 */
export const designSubmissionSchema = z.strictObject({
  graph: canvasGraphSchema,
  brief: designBriefSchema.nullable(),
  narrative: designNarrativeSchema.nullable(),
  model: designModelSchema.nullable().optional(),
  /** Composed by the studio from an interview session's turns; absent for every other session. */
  transcript: designTranscriptSchema.nullable().optional(),
});
export type DesignSubmission = z.infer<typeof designSubmissionSchema>;

/**
 * A binding as it sits in the editor: half-typed is fine. A draft is saved
 * with the session as the author works, shape-checked only — no referential
 * validator runs on it, because a draft is allowed to name a node the author
 * is about to draw.
 */
export const bindingDraftSchema = bindingSchema.extend({
  nodeIds: bounded.list(BINDING_NODES_BOUND, canvasId()),
  claim: bounded.text(BINDING_CLAIM_BOUND),
});

export const designBriefDraftSchema = z.strictObject({
  version: z.literal(DESIGN_BRIEF_VERSION),
  bindings: bounded.list(BRIEF_BINDINGS_BOUND, bindingDraftSchema),
});

/** A decision as it sits in the editor: a row whose choice is not typed yet is fine. */
export const designDecisionDraftSchema = designDecisionSchema.extend({
  choice: bounded.text(DECISION_TEXT_BOUND),
});

export const designNarrativeDraftSchema = designNarrativeSchema.extend({
  decisions: bounded.list(NARRATIVE_DECISIONS_BOUND, designDecisionDraftSchema).optional(),
  assumptions: bounded.list(NARRATIVE_ASSUMPTIONS_BOUND, bounded.text(ASSUMPTION_BOUND)).optional(),
});

/** The unsubmitted canvas, as `PUT /sessions/:id/draft` stores it and the workspace restores it. */
export const sessionDraftSchema = z.strictObject({
  graph: canvasGraphSchema,
  brief: designBriefDraftSchema.nullable(),
  narrative: designNarrativeDraftSchema.nullable(),
  model: designModelDraftSchema.nullable().optional(),
});
export type SessionDraft = z.infer<typeof sessionDraftSchema>;
