import {
  FLOW_STEPS_BOUND,
  type Binding,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
} from '@sysdesign/contracts';

/**
 * Pure rules for a brief being drafted in the editor.
 *
 * The API rejects an IMPOSSIBLE brief and the quality loop grades an
 * UNSUPPORTED one, and the editor respects both halves of that line: it must
 * be structurally incapable of producing a rejection, and it must never block
 * a claim the canvas simply fails to back up — that claim is the lesson.
 *
 * So every rejectable shape is prevented here rather than validated: the flow
 * tracer only offers hops that connect, and `reconcileBrief` (in
 * `@sysdesign/contracts`, shared with the quality loop's canvas pipeline) is
 * the one place a draft becomes a payload — dropping anything the canvas or
 * the rubric no longer supports, because a node can be deleted long after it
 * was bound.
 */

/** How far along one criterion's binding is — what the row's chip says. */
export type BindingState = 'empty' | 'incomplete' | 'bound';

/**
 * `bound` needs both halves the schema requires: a claim in the author's words
 * and at least one component. A path and a trade-off are welcome but never
 * required of the schema — the grader asks for the trade-off.
 */
export function bindingState(binding: Binding | null | undefined): BindingState {
  if (!binding) return 'empty';
  const hasClaim = binding.claim.trim().length > 0;
  const hasNodes = binding.nodeIds.length > 0;
  const hasPath = (binding.path ?? []).length > 0;
  const hasTradeoff = (binding.tradeoff ?? '').trim().length > 0;
  if (hasClaim && hasNodes) return 'bound';
  if (hasClaim || hasNodes || hasPath || hasTradeoff) return 'incomplete';
  return 'empty';
}

/**
 * Edges that may continue this walk. The first hop is unconstrained; every
 * later hop must start where the previous one ended, which is exactly the rule
 * the API enforces — offered as a choice rather than checked after the fact.
 */
export function nextHops(graph: CanvasGraph, path: readonly string[]): CanvasEdge[] {
  if (path.length >= FLOW_STEPS_BOUND.target) return [];
  const lastId = path[path.length - 1];
  if (lastId === undefined) return [...graph.edges];
  const last = graph.edges.find((edge) => edge.id === lastId);
  if (!last) return [];
  return graph.edges.filter((edge) => edge.source === last.target);
}

/** The nodes a walk passes through, in order, for rendering it back. */
export function walkNodes(graph: CanvasGraph, path: readonly string[]): CanvasNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const visited: CanvasNode[] = [];
  for (const [step, edgeId] of path.entries()) {
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) break;
    if (step === 0) {
      const source = byId.get(edge.source);
      if (source) visited.push(source);
    }
    const target = byId.get(edge.target);
    if (target) visited.push(target);
  }
  return visited;
}

/**
 * Ids named by any binding or walked by any path — what the brief accounts
 * for. Takes the draft rather than the payload on purpose: a half-typed
 * binding still names its components, and the editor's hint is about what the
 * author has not touched, not what would survive `reconcileBrief`.
 */
export function accountedNodeIds(bindings: readonly Binding[], graph: CanvasGraph): Set<string> {
  const accounted = new Set<string>();
  for (const binding of bindings) {
    for (const id of binding.nodeIds) accounted.add(id);
    for (const node of walkNodes(graph, binding.path ?? [])) accounted.add(node.id);
  }
  return accounted;
}
