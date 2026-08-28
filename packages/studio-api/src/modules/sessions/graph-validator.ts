import type { CanvasGraph } from '@sysdesign/contracts';

/**
 * Referential validation of a graph whose *shape* already passed the DTO
 * layer. Pure and total: collects every problem rather than failing fast, so
 * the 422 the service raises lists all of them in one round trip.
 */
export function validateGraphReferences(graph: CanvasGraph): string[] {
  const problems: string[] = [];

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      problems.push(`duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      problems.push(`duplicate edge id: ${edge.id}`);
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      problems.push(`edge ${edge.id} references unknown source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      problems.push(`edge ${edge.id} references unknown target node: ${edge.target}`);
    }
    if (edge.source === edge.target) {
      problems.push(`edge ${edge.id} is a self-loop on node: ${edge.source}`);
    }
  }

  return problems;
}
