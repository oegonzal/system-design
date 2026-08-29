import type { CanvasEdge, CanvasGraph, CanvasNode, GraphPatch } from '@sysdesign/contracts';

import type { SdEdge, SdNode } from './types';

/**
 * The only module that knows both graph shapes: the wire `CanvasGraph` and
 * React Flow's node/edge types. Everything here is pure — the store calls
 * these, components never do.
 */

/** Fallback layout for nodes stored without a position (older revisions, patches). */
const GRID = { columns: 4, originX: 60, originY: 60, stepX: 220, stepY: 140 };

function gridPosition(index: number): { x: number; y: number } {
  return {
    x: GRID.originX + (index % GRID.columns) * GRID.stepX,
    y: GRID.originY + Math.floor(index / GRID.columns) * GRID.stepY,
  };
}

/**
 * Serialize the working canvas to the wire shape. Ghost elements (suggestion
 * previews) are stripped — they are not part of the author's design until
 * accepted — and positions are rounded to ints so a drag by half a pixel
 * never dirties a stored revision diff.
 */
export function toCanvasGraph(nodes: SdNode[], edges: SdEdge[]): CanvasGraph {
  const realNodes = nodes.filter((node) => !node.data.ghost);
  const realNodeIds = new Set(realNodes.map((node) => node.id));

  const outNodes: CanvasNode[] = realNodes.map((node) => {
    const out: CanvasNode = {
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    };
    if (node.data.config && Object.keys(node.data.config).length > 0) {
      out.config = { ...node.data.config };
    }
    // Interface fields serialize only when non-empty, so an emptied editor
    // list never leaves an `operations: []` key rattling around the wire.
    if (node.data.responsibilities && node.data.responsibilities.length > 0) {
      out.responsibilities = [...node.data.responsibilities];
    }
    if (node.data.operations && node.data.operations.length > 0) {
      out.operations = node.data.operations.map((operation) => ({ ...operation }));
    }
    return out;
  });

  const outEdges: CanvasEdge[] = edges
    .filter(
      (edge) => !edge.data?.ghost && realNodeIds.has(edge.source) && realNodeIds.has(edge.target),
    )
    .map((edge) => {
      const out: CanvasEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.data?.kind ?? 'sync',
      };
      if (typeof edge.label === 'string' && edge.label.length > 0) out.label = edge.label;
      if (edge.data?.carries && edge.data.carries.length > 0) {
        out.carries = [...edge.data.carries];
      }
      return out;
    });

  return { nodes: outNodes, edges: outEdges };
}

/** Hydrate a stored graph into React Flow elements. Missing positions auto-grid. */
export function fromCanvasGraph(graph: CanvasGraph): { nodes: SdNode[]; edges: SdEdge[] } {
  const nodes: SdNode[] = graph.nodes.map((node, index) => ({
    id: node.id,
    type: 'sd',
    position: node.position ?? gridPosition(index),
    data: {
      kind: node.kind,
      label: node.label,
      ...(node.config ? { config: { ...node.config } } : {}),
      ...(node.responsibilities ? { responsibilities: [...node.responsibilities] } : {}),
      ...(node.operations
        ? { operations: node.operations.map((operation) => ({ ...operation })) }
        : {}),
    },
  }));

  const edges: SdEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    type: 'sd',
    source: edge.source,
    target: edge.target,
    ...(edge.label !== undefined ? { label: edge.label } : {}),
    data: {
      kind: edge.kind ?? 'sync',
      ...(edge.carries ? { carries: [...edge.carries] } : {}),
    },
  }));

  return { nodes, edges };
}

/**
 * Apply a finding's suggested fix to a wire graph. Pure and defensive: an op
 * referencing an id the graph does not have is skipped, never thrown on — a
 * suggestion computed against revision N may be accepted onto a draft that
 * has drifted.
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

/**
 * Render a patch as ghost overlay elements against the current graph. Ids
 * come through as-is (they carry the `suggested-` prefix), so an accepted
 * patch can never collide with the author's ids. Only add-ops become ghosts:
 * the non-geometric ops — update-node, update-edge, remove-edge and
 * remove-node — are described by the finding's prose and applied on accept.
 */
export function toGhostElements(
  patch: GraphPatch,
  existing: CanvasGraph,
): { nodes: SdNode[]; edges: SdEdge[] } {
  const nodes: SdNode[] = [];
  const edges: SdEdge[] = [];

  // Anchor ghost nodes near the existing drawing, not at the grid origin.
  const anchorX =
    existing.nodes.length > 0
      ? Math.max(...existing.nodes.map((node) => node.position?.x ?? 0)) + GRID.stepX
      : GRID.originX;
  const anchorY =
    existing.nodes.length > 0
      ? Math.min(...existing.nodes.map((node) => node.position?.y ?? 0)) + 40
      : GRID.originY;

  const knownIds = new Set(existing.nodes.map((node) => node.id));

  for (const op of patch.ops) {
    if (op.op === 'add-node') {
      if (knownIds.has(op.node.id)) continue;
      knownIds.add(op.node.id);
      nodes.push({
        id: op.node.id,
        type: 'sd',
        position: op.node.position ?? { x: anchorX, y: anchorY + nodes.length * GRID.stepY },
        data: {
          kind: op.node.kind,
          label: op.node.label,
          ...(op.node.config ? { config: { ...op.node.config } } : {}),
          ghost: true,
        },
      });
    } else if (op.op === 'add-edge') {
      if (!knownIds.has(op.edge.source) || !knownIds.has(op.edge.target)) continue;
      edges.push({
        id: op.edge.id,
        type: 'sd',
        source: op.edge.source,
        target: op.edge.target,
        ...(op.edge.label !== undefined ? { label: op.edge.label } : {}),
        data: {
          kind: op.edge.kind ?? 'sync',
          ...(op.edge.carries ? { carries: [...op.edge.carries] } : {}),
          ghost: true,
        },
      });
    }
  }

  return { nodes, edges };
}
