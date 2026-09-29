import { z } from 'zod';

import {
  BINDING_CLAIM_MAX_LENGTH,
  BINDING_MAX_NODES,
  BRIEF_MAX_BINDINGS,
  CANVAS_ID_MAX_LENGTH,
  CANVAS_MAX_EDGES,
  CANVAS_MAX_NODES,
  EDGE_KINDS,
  EDGE_LABEL_MAX_LENGTH,
  EDGE_MAX_CARRIES,
  FLOW_MAX_STEPS,
  NARRATION_MAX_COMPONENT_RATIONALES,
  NARRATION_MAX_CRITERION_NARRATIONS,
  NARRATION_OVERVIEW_MAX_LENGTH,
  NARRATION_PROSE_MAX_LENGTH,
  NODE_CONFIG_KEY_MAX_LENGTH,
  NODE_CONFIG_MAX_KEYS,
  NODE_CONFIG_STRING_VALUE_MAX_LENGTH,
  NODE_KINDS,
  NODE_LABEL_MAX_LENGTH,
  NODE_MAX_OPERATIONS,
  NODE_MAX_RESPONSIBILITIES,
  OPERATION_KINDS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_MAX_LENGTH,
  RESPONSIBILITY_MAX_LENGTH,
} from './canvas';
import { CRITERION_ID_MAX_LENGTH } from './quality-loop/evidence';

/**
 * The one definition of a design submission — diagram, brief and narrative.
 *
 * Every side parses it: the studio API validates what the canvas submits, the
 * quality loop's canvas pipeline declares it as the artifact its lenses judge
 * and its coach revises, and the canvas UI types its store from it. One schema
 * means one shape; there is no DTO class or hand-written interface to drift.
 *
 * Bounds are `.max()` everywhere and `.min(1)` only on the things other parts
 * reference (ids, a binding's components, a claim) — a model that overshoots
 * a length is clamped by the client, but an empty string it should not have
 * emitted cannot be repaired, so the schema asks for as little as it can.
 * `.describe()` lines are read by the coach, which writes into this schema.
 */

const canvasId = z.string().min(1).max(CANVAS_ID_MAX_LENGTH);
const criterionId = z.string().min(1).max(CRITERION_ID_MAX_LENGTH);

/** A config value is a scalar the author typed: text, a number or a flag. */
export const nodeConfigValueSchema = z.union([
  z.string().max(NODE_CONFIG_STRING_VALUE_MAX_LENGTH),
  z.number(),
  z.boolean(),
]);
export type NodeConfigValue = z.infer<typeof nodeConfigValueSchema>;

/**
 * Free-form configuration, one entry per key. A list rather than a record so
 * the same schema serves a model on every route — a JSON-schema record loses
 * its keys under structured output, a list does not.
 */
export const nodeConfigEntrySchema = z.strictObject({
  key: z.string().min(1).max(NODE_CONFIG_KEY_MAX_LENGTH),
  value: nodeConfigValueSchema,
});
export type NodeConfigEntry = z.infer<typeof nodeConfigEntrySchema>;

/**
 * One entry in a node's declared interface: a `command` mutates, a `query`
 * reads, an `event` is a fact published after something happened, a `stream`
 * is a continuous flow. Names are matched exactly by an edge's `carries`.
 */
export const nodeOperationSchema = z.strictObject({
  name: z.string().min(1).max(OPERATION_NAME_MAX_LENGTH),
  kind: z.enum(OPERATION_KINDS).optional(),
  idempotent: z.boolean().optional(),
  notes: z.string().max(OPERATION_NOTES_MAX_LENGTH).optional(),
});
export type NodeOperation = z.infer<typeof nodeOperationSchema>;

export const canvasNodeSchema = z.strictObject({
  id: canvasId.describe("The author's id; keep it. A new node takes an id starting with `ai-`."),
  kind: z.enum(NODE_KINDS),
  label: z.string().max(NODE_LABEL_MAX_LENGTH),
  /** Canvas layout, so a stored revision re-renders where the author left it. */
  position: z
    .strictObject({ x: z.number(), y: z.number() })
    .optional()
    .describe('Omit for a new node; the studio lays it out.'),
  config: z.array(nodeConfigEntrySchema).max(NODE_CONFIG_MAX_KEYS).optional(),
  /** Short role statements — "owns the order lifecycle", one clause each. */
  responsibilities: z
    .array(z.string().max(RESPONSIBILITY_MAX_LENGTH))
    .max(NODE_MAX_RESPONSIBILITIES)
    .optional(),
  operations: z.array(nodeOperationSchema).max(NODE_MAX_OPERATIONS).optional(),
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasEdgeSchema = z.strictObject({
  id: canvasId.describe("The author's id; keep it. A new edge takes an id starting with `ai-`."),
  source: canvasId,
  target: canvasId,
  /** A solid request/response call, or fire-and-forget messaging. */
  kind: z.enum(EDGE_KINDS),
  label: z.string().max(EDGE_LABEL_MAX_LENGTH).optional(),
  /** Operation names this connection exercises — declared on its source or its target. */
  carries: z
    .array(z.string().min(1).max(OPERATION_NAME_MAX_LENGTH))
    .max(EDGE_MAX_CARRIES)
    .optional(),
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

export const canvasGraphSchema = z.strictObject({
  nodes: z.array(canvasNodeSchema).max(CANVAS_MAX_NODES),
  edges: z.array(canvasEdgeSchema).max(CANVAS_MAX_EDGES),
});
export type CanvasGraph = z.infer<typeof canvasGraphSchema>;

/**
 * How the design meets one success criterion: the components that hold it, a
 * short claim in the author's words, and — where a request travels — the path
 * of edges it takes. One binding per criterion.
 */
export const bindingSchema = z.strictObject({
  criterionId,
  nodeIds: z.array(canvasId).min(1).max(BINDING_MAX_NODES),
  path: z.array(canvasId).max(FLOW_MAX_STEPS).optional(),
  claim: z.string().min(1).max(BINDING_CLAIM_MAX_LENGTH),
});
export type Binding = z.infer<typeof bindingSchema>;

export const DESIGN_BRIEF_VERSION = 1;

export const designBriefSchema = z.strictObject({
  version: z.literal(DESIGN_BRIEF_VERSION),
  bindings: z.array(bindingSchema).max(BRIEF_MAX_BINDINGS),
});
export type DesignBrief = z.infer<typeof designBriefSchema>;

export const NARRATION_VERSION = 1;

export const componentRationaleSchema = z.strictObject({
  nodeId: canvasId,
  prose: z.string().max(NARRATION_PROSE_MAX_LENGTH),
});
export type ComponentRationale = z.infer<typeof componentRationaleSchema>;

export const criterionNarrationSchema = z.strictObject({
  criterionId,
  prose: z.string().max(NARRATION_PROSE_MAX_LENGTH),
});
export type CriterionNarration = z.infer<typeof criterionNarrationSchema>;

/**
 * The walkthrough: why each component is there and how each requirement is
 * met, keyed to the node and criterion it explains rather than left as one
 * free-text box.
 */
export const designNarrativeSchema = z.strictObject({
  version: z.literal(NARRATION_VERSION),
  overview: z.string().max(NARRATION_OVERVIEW_MAX_LENGTH).optional(),
  componentRationales: z.array(componentRationaleSchema).max(NARRATION_MAX_COMPONENT_RATIONALES),
  criterionNarrations: z.array(criterionNarrationSchema).max(NARRATION_MAX_CRITERION_NARRATIONS),
});
export type DesignNarrative = z.infer<typeof designNarrativeSchema>;

/** What the canvas submits and what the quality loop judges: one object. */
export const designSubmissionSchema = z.strictObject({
  graph: canvasGraphSchema,
  brief: designBriefSchema.nullable(),
  narrative: designNarrativeSchema.nullable(),
});
export type DesignSubmission = z.infer<typeof designSubmissionSchema>;
