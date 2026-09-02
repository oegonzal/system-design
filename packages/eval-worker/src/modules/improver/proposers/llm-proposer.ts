import {
  applySuggestionPatch,
  narrationToProse,
  type CanvasGraph,
  type DesignBrief,
  type DesignNarrative,
  type GraphPatch,
  type NodeOperation,
  type PatchOp,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import { describeDesign } from '../../../engine/serialization/graph-text';
import type { EngineFinding, PromptFacts } from '../../../engine/types';
import {
  buildImprovementSchema,
  foldConfigEntries,
  type ImprovementProposal,
} from './proposal-schema';

export interface ImprovementProposalInput {
  graph: CanvasGraph;
  brief: DesignBrief | null;
  narrative: DesignNarrative | null;
  facts: PromptFacts;
  findings: EngineFinding[];
  overallScore: number;
}

/** A fully-assembled candidate design, ready to validate and score. */
export interface ImprovementCandidate {
  description: string;
  graph: CanvasGraph;
  brief: DesignBrief | null;
  narrative: DesignNarrative | null;
}

const SYSTEM_PROMPT = [
  'You are a principal engineer improving a system design one step at a time.',
  'You see the prompt, the current diagram, its brief and walkthrough, and the',
  "grader's current findings. Propose ONE focused improvement: fix the most",
  'severe findings first. You may add, change or remove components and edges,',
  'and you may replace the brief and the walkthrough wholesale. A design with',
  'no walkthrough cannot earn a top grade — when the narrative is missing or',
  'thin, write a complete one: an overview, two-sentence rationales for every',
  'real component (not monitoring/logging/tracing), and a flow narration per',
  'functional requirement. Every rationale must read as prose — at least two',
  'sentences. Keep the description to one concrete sentence: it is shown to',
  'the learner as the lesson of this iteration.',
].join(' ');

const MAX_FINDINGS_SHOWN = 12;

function buildUserPrompt(input: ImprovementProposalInput): string {
  const design = describeDesign(input.graph, input.facts, narrationToProse(input.narrative));
  const findings =
    input.findings.length === 0
      ? ['  (none — polish for a perfect score)']
      : input.findings
          .slice(0, MAX_FINDINGS_SHOWN)
          .map(
            (finding) =>
              `  [${finding.severity}·${finding.dimension}] ${finding.title} — ${finding.message}` +
              (finding.affectedNodeIds.length > 0
                ? ` (nodes: ${finding.affectedNodeIds.join(', ')})`
                : ''),
          );

  return [
    design.text,
    '',
    `# Current score: ${input.overallScore}/100`,
    '',
    '# Grader findings to fix (most severe first)',
    ...findings,
    '',
    '# Current brief (bindings + flows), as JSON',
    JSON.stringify(input.brief ?? { nfrBindings: [], flows: [] }),
    '',
    '# Instructions',
    'Propose one improvement step as the structured output. New node/edge/flow',
    'ids must start with "ai-". If you remove a node, replace the narrative and',
    'brief so nothing references it. Flows must be connected edge walks ending',
    'in a storage read.',
  ].join('\n');
}

/**
 * Findings ordered most-severe-first, deterministically: severity rank, then
 * dimension, then title — so the same design always shows the model the same
 * work list.
 */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function orderFindings(findings: readonly EngineFinding[]): EngineFinding[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      a.dimension.localeCompare(b.dimension) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * The schema's per-request workflow enums leave `fulfills`/`emits` inferred as
 * `unknown` (conditional keys); the values are zod-validated, so this copy
 * only restores the static type.
 */
function toOperations(
  operations:
    | readonly {
        name: string;
        kind: NodeOperation['kind'];
        idempotent?: boolean;
        fulfills?: unknown;
        emits?: unknown;
      }[]
    | undefined,
): NodeOperation[] | undefined {
  return operations?.map((op) => ({
    name: op.name,
    kind: op.kind,
    ...(op.idempotent !== undefined ? { idempotent: op.idempotent } : {}),
    ...(typeof op.fulfills === 'string' ? { fulfills: op.fulfills } : {}),
    ...(Array.isArray(op.emits) ? { emits: op.emits as string[] } : {}),
  }));
}

/** add-node ops first, so an add-edge naming a new node never lands before it. */
function toPatchOps(proposal: ImprovementProposal): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const op of proposal.graphOps ?? []) {
    if (op.op === 'add-node') {
      const { configEntries, operations, ...node } = op.node;
      ops.push({
        op: 'add-node',
        node: {
          ...node,
          config: foldConfigEntries(configEntries),
          operations: toOperations(operations),
        },
      });
    }
  }
  for (const op of proposal.graphOps ?? []) {
    switch (op.op) {
      case 'add-node':
        break; // already queued
      case 'add-edge':
        ops.push({ op: 'add-edge', edge: op.edge });
        break;
      case 'remove-node':
        ops.push({ op: 'remove-node', nodeId: op.nodeId });
        break;
      case 'remove-edge':
        ops.push({ op: 'remove-edge', edgeId: op.edgeId });
        break;
      case 'update-edge':
        ops.push({ op: 'update-edge', edgeId: op.edgeId, set: op.set });
        break;
      case 'update-node': {
        const { configEntries, operations, ...set } = op.set;
        const config = foldConfigEntries(configEntries);
        const ops2 = toOperations(operations);
        ops.push({
          op: 'update-node',
          nodeId: op.nodeId,
          set: { ...set, ...(config ? { config } : {}), ...(ops2 ? { operations: ops2 } : {}) },
        });
        break;
      }
    }
  }
  return ops;
}

/**
 * Drop only references that no longer resolve — a rationale for a removed
 * node, a binding naming one, a flow whose path lost an edge. The engine
 * still judges everything that remains; pruning never invents content, so it
 * cannot help a candidate score — it only keeps a good graph edit from being
 * rejected over stale side documents.
 */
function prune(
  graph: CanvasGraph,
  brief: DesignBrief | null,
  narrative: DesignNarrative | null,
): { brief: DesignBrief | null; narrative: DesignNarrative | null } {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));

  const prunedBrief: DesignBrief | null = brief
    ? {
        ...brief,
        nfrBindings: brief.nfrBindings
          .map((binding) => ({
            ...binding,
            nodeIds: binding.nodeIds.filter((id) => nodeIds.has(id)),
          }))
          .filter((binding) => binding.nodeIds.length > 0),
        flows: brief.flows.filter((flow) => flow.path.every((edgeId) => edgeIds.has(edgeId))),
      }
    : null;

  const prunedNarrative: DesignNarrative | null = narrative
    ? {
        ...narrative,
        componentRationales: narrative.componentRationales.filter((rationale) =>
          nodeIds.has(rationale.nodeId),
        ),
      }
    : null;

  return { brief: prunedBrief, narrative: prunedNarrative };
}

/**
 * One structured call per iteration. Free function, client first — testable
 * without Nest. Returns null on refusal/schema-miss (the client's contract),
 * which the runner records as a no-proposal iteration.
 */
export async function proposeImprovement(
  llm: LlmClient,
  input: ImprovementProposalInput,
): Promise<ImprovementCandidate | null> {
  if (!llm.enabled) return null;

  const schema = buildImprovementSchema(
    input.graph,
    input.facts.nfrs.map((nfr) => nfr.id),
    input.facts.functionalRequirementCount,
    input.facts.workflow,
  );

  const proposal = await llm.completeStructured({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({ ...input, findings: orderFindings(input.findings) }),
    schema,
    maxTokens: 8192,
  });
  if (!proposal) return null;

  const patch: GraphPatch = { description: proposal.description, ops: toPatchOps(proposal) };
  const graph = applySuggestionPatch(input.graph, patch);

  const brief: DesignBrief | null = proposal.brief
    ? { version: 1, nfrBindings: proposal.brief.nfrBindings, flows: proposal.brief.flows }
    : input.brief;
  const narrative: DesignNarrative | null = proposal.narrative
    ? { version: 1, ...proposal.narrative }
    : input.narrative;

  const pruned = prune(graph, brief, narrative);
  return { description: proposal.description, graph, ...pruned };
}
