import type { CanvasGraph } from './canvas';
import type { GraphPatch } from './patches';

/**
 * Apply a finding's suggested fix to a wire graph. Pure and defensive: an op
 * referencing an id the graph does not have is skipped, never thrown on — a
 * suggestion computed against revision N may be accepted onto a draft that
 * has drifted. Shared next to the `GraphPatch` contract so both appliers —
 * the canvas store's ghost-accept and the eval-worker's improvement loop —
 * resolve a patch identically.
 */
export function applySuggestionPatch(graph: CanvasGraph, patch: GraphPatch): CanvasGraph {
  let nodes = graph.nodes.map((node) => ({ ...node }));
  let edges = graph.edges.map((edge) => ({ ...edge }));

  for (const op of patch.ops) {
    switch (op.op) {
      case 'add-node': {
        if (nodes.some((node) => node.id === op.node.id)) break;
        nodes.push({ ...op.node });
        break;
      }
      case 'add-edge': {
        const knownIds = new Set(nodes.map((node) => node.id));
        if (edges.some((edge) => edge.id === op.edge.id)) break;
        if (!knownIds.has(op.edge.source) || !knownIds.has(op.edge.target)) break;
        edges.push({ ...op.edge });
        break;
      }
      case 'remove-edge': {
        edges = edges.filter((edge) => edge.id !== op.edgeId);
        break;
      }
      case 'remove-node': {
        // Mirrors the store's removeSelected: a node never leaves dangling
        // edges behind. An unknown id filters to a no-op.
        nodes = nodes.filter((node) => node.id !== op.nodeId);
        edges = edges.filter((edge) => edge.source !== op.nodeId && edge.target !== op.nodeId);
        break;
      }
      case 'update-node': {
        nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, ...op.set } : node));
        break;
      }
      case 'update-edge': {
        // Spread semantics match the contract: set values replace wholesale.
        edges = edges.map((edge) => (edge.id === op.edgeId ? { ...edge, ...op.set } : edge));
        break;
      }
    }
  }

  return { nodes, edges };
}
