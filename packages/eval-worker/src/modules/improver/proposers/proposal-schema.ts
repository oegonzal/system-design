import {
  BINDING_MAX_NODES,
  BINDING_NOTE_MAX_LENGTH,
  BRIEF_MAX_FLOWS,
  BRIEF_MAX_NFR_BINDINGS,
  MECHANISM_CLAIMS,
  NARRATION_MAX_COMPONENT_RATIONALES,
  NARRATION_MAX_FLOW_NARRATIONS,
  NARRATION_OVERVIEW_MAX_LENGTH,
  NARRATION_PROSE_MAX_LENGTH,
  NODE_KINDS,
  NODE_LABEL_MAX_LENGTH,
  OPERATION_KINDS,
  RESPONSIBILITY_MAX_LENGTH,
  type CanvasGraph,
  type NodeConfig,
  type WorkflowSpec,
} from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * The improvement proposal, structurally constrained per request — the
 * suggest-bindings discipline: enums are built from the ids that actually
 * exist, so the model cannot reference a node, edge, requirement or workflow
 * item the design does not have. New elements must carry `ai-` ids, which
 * cannot collide with author ids or the `suggested-` ghost prefix.
 *
 * Contract max-lengths ride in the schema because worker-persisted revisions
 * bypass the API's DTO layer: the schema is the first defense, the shared
 * validators the second, and the strict score comparator the last — a
 * hallucination can waste an iteration, never regress or corrupt a design.
 *
 * Brief and narrative are WHOLE replacements, not ops: both are small bounded
 * documents, and replacing them wholesale is simpler and self-consistent.
 * The graph keeps op form so the author's layout and untouched nodes survive.
 */

// New elements must carry an `ai-` prefix so they cannot collide with author
// ids or the `suggested-` ghost prefix; the rest is permissive (any id string
// is valid on the canvas) so a stray underscore or capital never rejects an
// otherwise-good proposal.
const NEW_ID = z.string().regex(/^ai-[A-Za-z0-9._-]{1,60}$/);

/** `z.record` maps poorly onto structured-output JSON schema; entries fold later. */
const configEntry = z.object({
  key: z.string().min(1).max(40),
  value: z.union([z.string().max(60), z.number(), z.boolean()]),
});

export const foldConfigEntries = (
  entries: readonly { key: string; value: string | number | boolean }[] | undefined,
): NodeConfig | undefined => {
  if (!entries || entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
};

export function buildImprovementSchema(
  graph: CanvasGraph,
  nfrIds: readonly string[],
  functionalRequirementCount: number,
  workflow: WorkflowSpec | null,
) {
  const nodeIds = graph.nodes.map((node) => node.id) as [string, ...string[]];
  const nodeRef = z.union([z.enum(nodeIds), NEW_ID]);
  const edgeIds = graph.edges.map((edge) => edge.id);
  const edgeRef =
    edgeIds.length > 0 ? z.union([z.enum(edgeIds as [string, ...string[]]), NEW_ID]) : NEW_ID;

  const fulfillableIds = workflow
    ? ([
        ...workflow.operations.map((op) => op.id),
        ...workflow.ingests.map((ingest) => ingest.id),
        ...workflow.aggregations.map((agg) => agg.id),
        ...workflow.events.map((event) => event.id),
      ] as [string, ...string[]])
    : null;
  const eventIds =
    workflow && workflow.events.length > 0
      ? (workflow.events.map((event) => event.id) as [string, ...string[]])
      : null;

  const operation = z.object({
    name: z.string().min(1).max(60),
    kind: z.enum(OPERATION_KINDS),
    idempotent: z.boolean().optional(),
    ...(fulfillableIds ? { fulfills: z.enum(fulfillableIds).optional() } : {}),
    ...(eventIds ? { emits: z.array(z.enum(eventIds)).max(6).optional() } : {}),
  });

  const nodeShape = {
    kind: z.enum(NODE_KINDS),
    label: z.string().min(1).max(NODE_LABEL_MAX_LENGTH),
    configEntries: z.array(configEntry).max(12).optional(),
    responsibilities: z.array(z.string().min(1).max(RESPONSIBILITY_MAX_LENGTH)).max(6).optional(),
    operations: z.array(operation).max(12).optional(),
  };

  const graphOp = z.discriminatedUnion('op', [
    z.object({ op: z.literal('add-node'), node: z.object({ id: NEW_ID, ...nodeShape }) }),
    z.object({
      op: z.literal('add-edge'),
      edge: z.object({
        id: NEW_ID,
        source: nodeRef,
        target: nodeRef,
        kind: z.enum(['sync', 'async']).optional(),
        carries: z.array(z.string().min(1).max(60)).max(8).optional(),
      }),
    }),
    z.object({ op: z.literal('remove-node'), nodeId: z.enum(nodeIds) }),
    ...(edgeIds.length > 0
      ? [
          z.object({
            op: z.literal('remove-edge'),
            edgeId: z.enum(edgeIds as [string, ...string[]]),
          }),
          z.object({
            op: z.literal('update-edge'),
            edgeId: z.enum(edgeIds as [string, ...string[]]),
            set: z.object({
              kind: z.enum(['sync', 'async']).optional(),
              carries: z.array(z.string().min(1).max(60)).max(8).optional(),
            }),
          }),
        ]
      : []),
    z.object({
      op: z.literal('update-node'),
      nodeId: z.enum(nodeIds),
      set: z.object({
        kind: z.enum(NODE_KINDS).optional(),
        label: z.string().min(1).max(NODE_LABEL_MAX_LENGTH).optional(),
        configEntries: z.array(configEntry).max(12).optional(),
        responsibilities: z
          .array(z.string().min(1).max(RESPONSIBILITY_MAX_LENGTH))
          .max(6)
          .optional(),
        operations: z.array(operation).max(12).optional(),
      }),
    }),
  ]);

  const requirementIndex = z
    .number()
    .int()
    .min(0)
    .max(Math.max(0, functionalRequirementCount - 1));

  const brief = z.object({
    nfrBindings: z
      .array(
        z.object({
          // Generated prompts always carry NFRs; the cast records that fact.
          nfrId: z.enum(nfrIds as [string, ...string[]]),
          nodeIds: z.array(nodeRef).min(1).max(BINDING_MAX_NODES),
          mechanism: z.enum(MECHANISM_CLAIMS),
          note: z.string().max(BINDING_NOTE_MAX_LENGTH).optional(),
        }),
      )
      .max(BRIEF_MAX_NFR_BINDINGS),
    flows: z
      .array(
        z.object({
          id: NEW_ID,
          requirementIndex,
          path: z.array(edgeRef).min(1).max(20),
          note: z.string().max(BINDING_NOTE_MAX_LENGTH).optional(),
        }),
      )
      .max(BRIEF_MAX_FLOWS),
  });

  // Prose caps are generous here and clamped to the contract maxima when the
  // candidate is assembled (see llm-proposer). A model that writes a slightly
  // richer overview or rationale than the contract allows should have it
  // trimmed, never have the whole proposal rejected over a few characters.
  const narrative = z.object({
    overview: z
      .string()
      .min(1)
      .max(NARRATION_OVERVIEW_MAX_LENGTH * 2),
    componentRationales: z
      .array(
        z.object({
          nodeId: nodeRef,
          prose: z
            .string()
            .min(1)
            .max(NARRATION_PROSE_MAX_LENGTH * 2),
        }),
      )
      .max(NARRATION_MAX_COMPONENT_RATIONALES),
    flowNarrations: z
      .array(
        z.object({
          requirementIndex,
          prose: z
            .string()
            .min(1)
            .max(NARRATION_PROSE_MAX_LENGTH * 2),
        }),
      )
      .max(NARRATION_MAX_FLOW_NARRATIONS),
  });

  return z.object({
    description: z
      .string()
      .min(1)
      .max(400)
      .describe('One sentence: what this iteration changes and why — the lesson.'),
    graphOps: z.array(graphOp).max(8).optional(),
    brief: brief.optional().describe('WHOLE replacement of the design brief when provided.'),
    narrative: narrative.optional().describe('WHOLE replacement of the walkthrough when provided.'),
  });
}

export type ImprovementProposal = z.infer<ReturnType<typeof buildImprovementSchema>>;
