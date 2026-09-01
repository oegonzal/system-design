import {
  MECHANISM_KINDS,
  type CanvasGraph,
  type DesignBrief,
  type NodeKind,
} from '@sysdesign/contracts';

/** The slice of the prompt a brief must line up with. */
export interface BriefPromptRefs {
  nonFunctionalRequirements: readonly { id: string }[];
  functionalRequirements: readonly string[];
}

/**
 * Referential validation of a brief whose *shape* already passed the DTO
 * layer. Pure and total, like `validateGraphReferences` — every problem in one
 * 422 rather than one per round trip.
 *
 * The line this file must hold: it rejects claims that are IMPOSSIBLE (a node
 * that is not on the canvas, a flow that does not connect, a mechanism a queue
 * could never provide) and says nothing about claims that are merely
 * UNSUPPORTED. "You bound failover to a database with no replica" is a grade,
 * not a save blocker — if the API refused it, the API would be doing the
 * teaching, and the author would never see the finding that explains why.
 */
export function validateBriefReferences(
  graph: CanvasGraph,
  brief: DesignBrief,
  prompt: BriefPromptRefs,
): string[] {
  const problems: string[] = [];

  const kindById = new Map<string, NodeKind>(graph.nodes.map((node) => [node.id, node.kind]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const nfrIds = new Set(prompt.nonFunctionalRequirements.map((nfr) => nfr.id));

  const boundPairs = new Set<string>();
  for (const binding of brief.nfrBindings) {
    if (!nfrIds.has(binding.nfrId)) {
      problems.push(`binding references unknown requirement: ${binding.nfrId}`);
    }

    const pair = `${binding.nfrId}::${binding.mechanism}`;
    if (boundPairs.has(pair)) {
      problems.push(`duplicate binding of ${binding.mechanism} to requirement ${binding.nfrId}`);
    }
    boundPairs.add(pair);

    const eligible: readonly NodeKind[] = MECHANISM_KINDS[binding.mechanism];
    const seenNodes = new Set<string>();
    for (const nodeId of binding.nodeIds) {
      const kind = kindById.get(nodeId);
      if (kind === undefined) {
        problems.push(`binding references unknown node: ${nodeId}`);
        continue;
      }
      if (seenNodes.has(nodeId)) {
        problems.push(`binding of ${binding.mechanism} lists node ${nodeId} twice`);
      }
      seenNodes.add(nodeId);
      if (!eligible.includes(kind)) {
        problems.push(`a ${kind} cannot provide ${binding.mechanism} (node ${nodeId})`);
      }
    }
  }

  const flowIds = new Set<string>();
  for (const flow of brief.flows) {
    if (flowIds.has(flow.id)) {
      problems.push(`duplicate flow id: ${flow.id}`);
    }
    flowIds.add(flow.id);

    if (flow.requirementIndex >= prompt.functionalRequirements.length) {
      problems.push(
        `flow ${flow.id} claims requirement #${flow.requirementIndex}, but the prompt has ${prompt.functionalRequirements.length}`,
      );
    }

    if (flow.path.length === 0) {
      problems.push(`flow ${flow.id} traces no path`);
      continue;
    }

    // A walk, not a bag of edges: each hop must start where the last one ended.
    let previousTarget: string | null = null;
    for (const edgeId of flow.path) {
      const edge = edgeById.get(edgeId);
      if (edge === undefined) {
        problems.push(`flow ${flow.id} references unknown edge: ${edgeId}`);
        previousTarget = null;
        continue;
      }
      if (previousTarget !== null && edge.source !== previousTarget) {
        problems.push(`flow ${flow.id} breaks at edge ${edgeId} — it does not continue the path`);
      }
      previousTarget = edge.target;
    }
  }

  return problems;
}
