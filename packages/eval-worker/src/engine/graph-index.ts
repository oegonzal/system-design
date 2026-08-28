/**
 * A read-only index over one canvas graph, built once per engine run so every
 * rule gets O(1) lookups and cheap traversals instead of re-scanning arrays.
 * Edges are directed (source → target); helpers accept a direction so rules
 * can also ask "adjacent either way" questions (replica next to a database).
 */
import type { CanvasEdge, CanvasGraph, CanvasNode, EdgeKind, NodeKind } from '@sysdesign/contracts';

export type TraversalDirection = 'out' | 'in' | 'both';

export interface PathOptions {
  /** Defaults to 'out' — follow edges the way traffic flows. */
  direction?: TraversalDirection;
  /** Node kinds that may not appear as intermediate hops; endpoints are exempt. */
  avoidKinds?: readonly NodeKind[];
}

export class GraphIndex {
  private readonly nodeById = new Map<string, CanvasNode>();
  private readonly nodesByKind = new Map<NodeKind, CanvasNode[]>();
  private readonly outsByNode = new Map<string, CanvasEdge[]>();
  private readonly insByNode = new Map<string, CanvasEdge[]>();

  constructor(readonly graph: CanvasGraph) {
    for (const node of graph.nodes) {
      // Defensive: a malformed graph with duplicate ids keeps the first occurrence.
      if (this.nodeById.has(node.id)) continue;
      this.nodeById.set(node.id, node);
      const bucket = this.nodesByKind.get(node.kind);
      if (bucket) {
        bucket.push(node);
      } else {
        this.nodesByKind.set(node.kind, [node]);
      }
    }
    for (const edge of graph.edges) {
      const outs = this.outsByNode.get(edge.source);
      if (outs) {
        outs.push(edge);
      } else {
        this.outsByNode.set(edge.source, [edge]);
      }
      const ins = this.insByNode.get(edge.target);
      if (ins) {
        ins.push(edge);
      } else {
        this.insByNode.set(edge.target, [edge]);
      }
    }
  }

  byId(id: string): CanvasNode | undefined {
    return this.nodeById.get(id);
  }

  byKind(kind: NodeKind): CanvasNode[] {
    return this.nodesByKind.get(kind) ?? [];
  }

  hasKind(kind: NodeKind): boolean {
    return this.byKind(kind).length > 0;
  }

  kinds(): Set<NodeKind> {
    return new Set(this.nodesByKind.keys());
  }

  /** Every node, deduplicated by id, in canvas order. */
  nodes(): CanvasNode[] {
    return [...this.nodeById.values()];
  }

  edges(): CanvasEdge[] {
    return this.graph.edges;
  }

  clients(): CanvasNode[] {
    return this.byKind('client');
  }

  inEdges(nodeId: string): CanvasEdge[] {
    return this.insByNode.get(nodeId) ?? [];
  }

  outEdges(nodeId: string): CanvasEdge[] {
    return this.outsByNode.get(nodeId) ?? [];
  }

  /** The wire default: an edge with no kind is a synchronous call. */
  edgeKind(edge: CanvasEdge): EdgeKind {
    return edge.kind ?? 'sync';
  }

  degree(nodeId: string): number {
    return this.inEdges(nodeId).length + this.outEdges(nodeId).length;
  }

  /** Adjacent nodes in either direction (self-loops resolve to the node itself). */
  neighbors(nodeId: string): CanvasNode[] {
    const seen = new Set<string>();
    const result: CanvasNode[] = [];
    const collect = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const node = this.nodeById.get(id);
      if (node) result.push(node);
    };
    for (const edge of this.outEdges(nodeId)) collect(edge.target);
    for (const edge of this.inEdges(nodeId)) collect(edge.source);
    return result;
  }

  /** BFS closure over the given seeds (seeds included when they exist). */
  reachableFrom(
    nodeIds: readonly string[],
    opts: { direction?: TraversalDirection } = {},
  ): Set<string> {
    const direction = opts.direction ?? 'out';
    const visited = new Set<string>();
    const queue: string[] = [];
    for (const id of nodeIds) {
      if (this.nodeById.has(id) && !visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const next of this.step(current, direction)) {
        if (visited.has(next) || !this.nodeById.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    return visited;
  }

  /**
   * Is there a path from → to? `avoidKinds` bans kinds as intermediate hops
   * only — a path may start or end on an avoided kind, which is what lets
   * "client reaches service without passing a load balancer" read naturally.
   */
  pathExists(fromNodeId: string, toNodeId: string, opts: PathOptions = {}): boolean {
    if (!this.nodeById.has(fromNodeId) || !this.nodeById.has(toNodeId)) return false;
    if (fromNodeId === toNodeId) return true;
    const direction = opts.direction ?? 'out';
    const avoid = new Set(opts.avoidKinds ?? []);
    const visited = new Set<string>([fromNodeId]);
    const queue: string[] = [fromNodeId];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const next of this.step(current, direction)) {
        if (next === toNodeId) return true;
        if (visited.has(next)) continue;
        visited.add(next);
        const node = this.nodeById.get(next);
        if (!node || avoid.has(node.kind)) continue; // cannot travel THROUGH this node
        queue.push(next);
      }
    }
    return false;
  }

  private step(nodeId: string, direction: TraversalDirection): string[] {
    const nexts: string[] = [];
    if (direction !== 'in') {
      for (const edge of this.outEdges(nodeId)) nexts.push(edge.target);
    }
    if (direction !== 'out') {
      for (const edge of this.inEdges(nodeId)) nexts.push(edge.source);
    }
    return nexts;
  }
}

export function buildGraphIndex(graph: CanvasGraph): GraphIndex {
  return new GraphIndex(graph);
}
