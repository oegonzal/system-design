import {
  LAYOUT_ORIGIN,
  layoutGraph,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type NodeOperation,
} from '@sysdesign/contracts';

import type { SdEdge, SdNode } from './types';

/**
 * The only module that knows both graph shapes: the wire `CanvasGraph` and
 * React Flow's node/edge types. Everything here is pure — the store calls
 * these, components never do.
 */

/**
 * An operation row is a declaration once it has a name — the schema's own
 * floor. A row whose name is still empty is one being typed: the editor keeps
 * it, the wire never sees it.
 */
export const isDeclaredOperation = (operation: NodeOperation): boolean => operation.name.length > 0;

/** The operation names a connection between these two nodes may legally carry. */
function declaredOnEitherEnd(source: SdNode | undefined, target: SdNode | undefined): Set<string> {
  return new Set(
    [...(source?.data.operations ?? []), ...(target?.data.operations ?? [])]
      .filter(isDeclaredOperation)
      .map((operation) => operation.name),
  );
}

/**
 * Serialize the working canvas to the wire shape — the one projection both
 * the draft and a submit go through. Positions are rounded to ints so a drag
 * by half a pixel never dirties a stored revision diff; an operation row with
 * no name yet is left out, so a half-typed row never costs a save; and a
 * carry naming an operation neither endpoint still declares is dropped — the
 * API refuses it, and the author already sees it as a stale chip.
 */
export function toCanvasGraph(nodes: SdNode[], edges: SdEdge[]): CanvasGraph {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const outNodes: CanvasNode[] = nodes.map((node) => {
    const out: CanvasNode = {
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    };
    // Every list serializes only when non-empty, so an emptied editor never
    // leaves an `operations: []` key rattling around the wire.
    if (node.data.config && node.data.config.length > 0) {
      out.config = node.data.config.map((entry) => ({ ...entry }));
    }
    if (node.data.responsibilities && node.data.responsibilities.length > 0) {
      out.responsibilities = [...node.data.responsibilities];
    }
    const operations = (node.data.operations ?? []).filter(isDeclaredOperation);
    if (operations.length > 0) {
      out.operations = operations.map((operation) => ({ ...operation }));
    }
    return out;
  });

  const outEdges: CanvasEdge[] = edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
    .map((edge) => {
      const out: CanvasEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.data?.kind ?? 'sync',
      };
      if (typeof edge.label === 'string' && edge.label.length > 0) out.label = edge.label;
      const declared = declaredOnEitherEnd(byId.get(edge.source), byId.get(edge.target));
      const carries = (edge.data?.carries ?? []).filter((name) => declared.has(name));
      if (carries.length > 0) out.carries = carries;
      return out;
    });

  return { nodes: outNodes, edges: outEdges };
}

/**
 * Hydrate a stored graph into React Flow elements. A node stored without a
 * position (an old revision, a node nothing placed) is given one by the
 * contract's `layoutGraph` — the layout the API gives a coach's revision —
 * beside the nodes it connects to and a whole block clear of every other;
 * a node that has a position keeps it exactly.
 */
export function fromCanvasGraph(graph: CanvasGraph): { nodes: SdNode[]; edges: SdEdge[] } {
  const nodes: SdNode[] = layoutGraph(graph).nodes.map((node) => ({
    id: node.id,
    type: 'sd',
    position: node.position ?? LAYOUT_ORIGIN,
    data: {
      kind: node.kind,
      label: node.label,
      ...(node.config ? { config: node.config.map((entry) => ({ ...entry })) } : {}),
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
      kind: edge.kind,
      ...(edge.carries ? { carries: [...edge.carries] } : {}),
    },
  }));

  return { nodes, edges };
}
