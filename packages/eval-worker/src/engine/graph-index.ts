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
  /** Only travel edges whose resolved kind is listed (missing kind = 'sync'). */
  edgeKinds?: readonly EdgeKind[];
}

/**
 * Longest-chain search is exponential on pathological dense graphs, so it stops
 * expanding after this many steps and reports the best chain found so far —
 * deterministic, and far beyond anything a 100-node canvas produces honestly.
 */
const CHAIN_EXPANSION_BUDGET = 20_000;

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
    opts: { direction?: TraversalDirection; edgeKinds?: readonly EdgeKind[] } = {},
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
      for (const next of this.step(current, direction, opts.edgeKinds)) {
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
    return this.hopCount(fromNodeId, toNodeId, opts) !== null;
  }

  /**
   * Fewest edges on any from → to path under the same options as `pathExists`
   * (`avoidKinds` still bans intermediate hops only). 0 when from === to,
   * null when unreachable.
   */
  hopCount(fromNodeId: string, toNodeId: string, opts: PathOptions = {}): number | null {
    if (!this.nodeById.has(fromNodeId) || !this.nodeById.has(toNodeId)) return null;
    if (fromNodeId === toNodeId) return 0;
    const direction = opts.direction ?? 'out';
    const avoid = new Set(opts.avoidKinds ?? []);
    const visited = new Set<string>([fromNodeId]);
    const queue: Array<{ id: string; hops: number }> = [{ id: fromNodeId, hops: 0 }];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const next of this.step(current.id, direction, opts.edgeKinds)) {
        if (next === toNodeId) return current.hops + 1;
        if (visited.has(next)) continue;
        visited.add(next);
        const node = this.nodeById.get(next);
        if (!node || avoid.has(node.kind)) continue; // cannot travel THROUGH this node
        queue.push({ id: next, hops: current.hops + 1 });
      }
    }
    return null;
  }

  /**
   * The longest simple chain (counted in edges) walkable from any seed. DFS
   * with an on-path visited set, so cycles terminate rather than loop; the
   * expansion budget bounds the pathological dense case (see constant above).
   */
  longestChain(
    fromIds: readonly string[],
    opts: { direction?: TraversalDirection; edgeKinds?: readonly EdgeKind[] } = {},
  ): number {
    const direction = opts.direction ?? 'out';
    let best = 0;
    let budget = CHAIN_EXPANSION_BUDGET;
    const onPath = new Set<string>();
    const walk = (id: string, depth: number): void => {
      if (depth > best) best = depth;
      if (budget-- <= 0) return;
      onPath.add(id);
      for (const next of this.step(id, direction, opts.edgeKinds)) {
        if (onPath.has(next) || !this.nodeById.has(next)) continue;
        walk(next, depth + 1);
      }
      onPath.delete(id);
    };
    for (const id of fromIds) {
      if (this.nodeById.has(id)) walk(id, 0);
    }
    return best;
  }

  /** Does any directed cycle exist (optionally over the given edge kinds only)? */
  hasCycle(opts: { edgeKinds?: readonly EdgeKind[] } = {}): boolean {
    // Iterative DFS coloring: 1 = on the current stack, 2 = fully explored.
    const color = new Map<string, 1 | 2>();
    for (const root of this.nodeById.keys()) {
      if (color.has(root)) continue;
      const stack: Array<{ id: string; nexts: string[]; cursor: number }> = [
        { id: root, nexts: this.step(root, 'out', opts.edgeKinds), cursor: 0 },
      ];
      color.set(root, 1);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (frame.cursor >= frame.nexts.length) {
          color.set(frame.id, 2);
          stack.pop();
          continue;
        }
        const next = frame.nexts[frame.cursor++];
        if (!this.nodeById.has(next)) continue;
        const mark = color.get(next);
        if (mark === 1) return true;
        if (mark === 2) continue;
        color.set(next, 1);
        stack.push({ id: next, nexts: this.step(next, 'out', opts.edgeKinds), cursor: 0 });
      }
    }
    return false;
  }

  /** Weakly-connected components, ordered (and internally ordered) by canvas order. */
  components(): CanvasNode[][] {
    const assigned = new Set<string>();
    const result: CanvasNode[][] = [];
    for (const node of this.nodeById.values()) {
      if (assigned.has(node.id)) continue;
      const memberIds = this.reachableFrom([node.id], { direction: 'both' });
      const members: CanvasNode[] = [];
      for (const candidate of this.nodeById.values()) {
        if (memberIds.has(candidate.id)) {
          members.push(candidate);
          assigned.add(candidate.id);
        }
      }
      result.push(members);
    }
    return result;
  }

  /** Directed edges source → target between the two nodes. */
  edgesBetween(sourceId: string, targetId: string): CanvasEdge[] {
    return this.outEdges(sourceId).filter((edge) => edge.target === targetId);
  }

  /** Nodes feeding this one over async edges — who produces into a queue/stream. */
  producersOf(nodeId: string): CanvasNode[] {
    return this.asyncNeighbors(this.inEdges(nodeId), (edge) => edge.source);
  }

  /** Nodes this one feeds over async edges — who consumes a queue/stream. */
  consumersOf(nodeId: string): CanvasNode[] {
    return this.asyncNeighbors(this.outEdges(nodeId), (edge) => edge.target);
  }

  private asyncNeighbors(edges: CanvasEdge[], pick: (edge: CanvasEdge) => string): CanvasNode[] {
    const seen = new Set<string>();
    const result: CanvasNode[] = [];
    for (const edge of edges) {
      if (this.edgeKind(edge) !== 'async') continue;
      const id = pick(edge);
      if (seen.has(id)) continue;
      seen.add(id);
      const node = this.nodeById.get(id);
      if (node) result.push(node);
    }
    return result;
  }

  private step(
    nodeId: string,
    direction: TraversalDirection,
    edgeKinds?: readonly EdgeKind[],
  ): string[] {
    const travels = (edge: CanvasEdge) => !edgeKinds || edgeKinds.includes(this.edgeKind(edge));
    const nexts: string[] = [];
    if (direction !== 'in') {
      for (const edge of this.outEdges(nodeId)) {
        if (travels(edge)) nexts.push(edge.target);
      }
    }
    if (direction !== 'out') {
      for (const edge of this.inEdges(nodeId)) {
        if (travels(edge)) nexts.push(edge.source);
      }
    }
    return nexts;
  }
}

export function buildGraphIndex(graph: CanvasGraph): GraphIndex {
  return new GraphIndex(graph);
}
