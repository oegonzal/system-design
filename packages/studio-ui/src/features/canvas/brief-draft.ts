import {
  BINDING_CLAIM_MAX_LENGTH,
  BINDING_MAX_NODES,
  BRIEF_MAX_BINDINGS,
  DESIGN_BRIEF_VERSION,
  FLOW_MAX_STEPS,
  type Binding,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type CriterionRef,
  type DesignBrief,
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
 * tracer only offers hops that connect, and `reconcileBrief` is the one place
 * a draft becomes a payload — dropping anything the canvas or the rubric no
 * longer supports, because a node can be deleted long after it was bound.
 */

/** How far along one criterion's binding is — what the row's chip says. */
export type BindingState = 'empty' | 'incomplete' | 'bound';

/**
 * `bound` needs both halves the schema requires: a claim in the author's words
 * and at least one component. A path is welcome but never required.
 */
export function bindingState(binding: Binding | null | undefined): BindingState {
  if (!binding) return 'empty';
  const hasClaim = binding.claim.trim().length > 0;
  const hasNodes = binding.nodeIds.length > 0;
  const hasPath = (binding.path ?? []).length > 0;
  if (hasClaim && hasNodes) return 'bound';
  if (hasClaim || hasNodes || hasPath) return 'incomplete';
  return 'empty';
}

/**
 * Edges that may continue this walk. The first hop is unconstrained; every
 * later hop must start where the previous one ended, which is exactly the rule
 * the API enforces — offered as a choice rather than checked after the fact.
 */
export function nextHops(graph: CanvasGraph, path: readonly string[]): CanvasEdge[] {
  if (path.length >= FLOW_MAX_STEPS) return [];
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

/** The longest prefix of `path` that is still a connected walk of real edges. */
function validPrefix(graph: CanvasGraph, path: readonly string[]): string[] {
  const kept: string[] = [];
  let previousTarget: string | null = null;
  for (const edgeId of path.slice(0, FLOW_MAX_STEPS)) {
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) break;
    if (previousTarget !== null && edge.source !== previousTarget) break;
    kept.push(edge.id);
    previousTarget = edge.target;
  }
  return kept;
}

/**
 * The draft as a payload, or `null` when there is nothing worth sending.
 *
 * Null rather than an empty brief on purpose: the lenses read "no brief" as
 * exactly that, while a stored `{ bindings: [] }` would imply the author
 * chose to bind nothing.
 *
 * Everything here is a DROP, never a rejection. The canvas is edited long after
 * a binding is made, and an author who deletes a node should not be told their
 * brief is invalid — the claim about that node simply stops existing. A binding
 * is kept only when the API would accept it: a criterion the prompt derived, a
 * claim, at least one component still on the canvas, and a path that is a
 * connected walk (truncated at the first hop that no longer connects).
 */
export function reconcileBrief(
  bindings: readonly Binding[],
  graph: CanvasGraph,
  criteria: readonly CriterionRef[],
): DesignBrief | null {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  const seen = new Set<string>();

  const kept: Binding[] = [];
  for (const binding of bindings) {
    if (!criterionIds.has(binding.criterionId) || seen.has(binding.criterionId)) continue;
    const claim = binding.claim.trim().slice(0, BINDING_CLAIM_MAX_LENGTH);
    if (claim.length === 0) continue;
    const nodes = [...new Set(binding.nodeIds)]
      .filter((id) => nodeIds.has(id))
      .slice(0, BINDING_MAX_NODES);
    if (nodes.length === 0) continue;
    const path = validPrefix(graph, binding.path ?? []);
    seen.add(binding.criterionId);
    kept.push({
      criterionId: binding.criterionId,
      nodeIds: nodes,
      ...(path.length > 0 ? { path } : {}),
      claim,
    });
    if (kept.length >= BRIEF_MAX_BINDINGS) break;
  }

  if (kept.length === 0) return null;
  return { version: DESIGN_BRIEF_VERSION, bindings: kept };
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
