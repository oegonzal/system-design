import { appliedKeyed } from './canvas-change.lists';
import type { CanvasChange } from './canvas-change.schema';
import type { CanvasEdge, CanvasGraph, CanvasNode } from './canvas.schema';

/**
 * The graph with a change set's nodes and edges applied, total against the
 * reference slips a coach makes. Measured on the first change-set rounds
 * (arm C, lane run 2026-11-08T22-48-49-342-e4eb2d): one round appended an
 * edge whose carries "neither n-13 nor node.14 declares" and the loop's
 * `references` validator refused the whole revision (score 0); another added
 * an edge that repeated e-14 under a new id. So after the upserts and the
 * removals the result is WIRED: an edge whose endpoint is not a node of the
 * result goes — which is the node→edge cascade, an edge touching a removed
 * node included, an edge this change set added included, as the studio's
 * `removeElements` drops them — and so does an edge joining a node to
 * itself; a carried operation neither endpoint declares, or one repeated,
 * leaves its edge and the edge stays; and an unknown-keyed edge that repeats
 * an existing source → target of the same kind is that edge rewritten, its
 * id kept — an edge this change set KEEPS: probed 2026-11-08 on the fixture
 * best, `remove: ['e-2']` beside a new edge on e-2's hop folded the new edge
 * onto e-2 and the removal then took both, so the replacement the coach drew
 * was lost; an edge named in the removals now stands for nothing. What is
 * left is what the validator accepts; what is merely unwise is left for the
 * lenses to judge.
 */
type GraphChanges = Pick<CanvasChange['changes'], 'nodes' | 'edges'>;

const byId = (item: { id: string }): string => item.id;

/** A node rewritten without a position keeps the one the best had for its id: the coach may omit it, and the studio laid the node out already. */
function placedAsBest(nodes: readonly CanvasNode[], node: CanvasNode): CanvasNode {
  if (node.position !== undefined) return node;
  const position = nodes.find((placed) => placed.id === node.id)?.position;
  return position === undefined ? node : { ...node, position };
}

const sameHop = (a: CanvasEdge, b: CanvasEdge): boolean =>
  a.source === b.source && a.target === b.target && a.kind === b.kind;

/**
 * An unknown edge that repeats a hop already drawn — by an edge this change
 * set keeps — is that edge rewritten under its id: the coach meant the hop it
 * was shown, not a second one beside it. An edge in `removed` stands for
 * nothing, or the replacement drawn beside its removal would be folded onto
 * it and removed with it.
 */
const asKeptHop =
  (removed: ReadonlySet<string>) =>
  (edge: CanvasEdge, edges: readonly CanvasEdge[]): CanvasEdge => {
    const drawn = edges.find((kept) => !removed.has(kept.id) && sameHop(kept, edge));
    return drawn === undefined ? edge : { ...edge, id: drawn.id };
  };

/** `edge` carrying exactly `carries`, the key gone when there is nothing left to carry. */
function carrying(edge: CanvasEdge, carries: readonly string[]): CanvasEdge {
  const { carries: _carries, ...rest } = edge;
  return carries.length === 0 ? rest : { ...rest, carries: [...carries] };
}

/** The edges of `edges` that `nodes` can hold, each carrying only what one of its endpoints declares, once. */
function wiredEdges(nodes: readonly CanvasNode[], edges: readonly CanvasEdge[]): CanvasEdge[] {
  const operationsByNode = new Map(
    nodes.map((node) => [
      node.id,
      new Set((node.operations ?? []).map((operation) => operation.name)),
    ]),
  );
  return edges.flatMap((edge) => {
    const atSource = operationsByNode.get(edge.source);
    const atTarget = operationsByNode.get(edge.target);
    if (atSource === undefined || atTarget === undefined || edge.source === edge.target) return [];
    if (edge.carries === undefined) return [edge];
    const declared = [...new Set(edge.carries)].filter(
      (name) => atSource.has(name) || atTarget.has(name),
    );
    return [declared.length === edge.carries.length ? edge : carrying(edge, declared)];
  });
}

export function appliedGraph(graph: CanvasGraph, { nodes, edges }: GraphChanges): CanvasGraph {
  if (nodes === undefined && edges === undefined) return graph;
  const nodeChanges = nodes && {
    upsert: nodes.upsert.map((node) => placedAsBest(graph.nodes, node)),
    remove: nodes.remove,
  };
  const nextNodes = appliedKeyed(graph.nodes, nodeChanges, byId);
  const nextEdges = appliedKeyed(graph.edges, edges, byId, asKeptHop(new Set(edges?.remove)));
  return { nodes: nextNodes, edges: wiredEdges(nextNodes, nextEdges) };
}
