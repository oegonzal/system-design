import {
  BINDING_MAX_NODES,
  BRIEF_MAX_FLOWS,
  BRIEF_MAX_NFR_BINDINGS,
  DESIGN_BRIEF_VERSION,
  FLOW_MAX_STEPS,
  FLOW_SINK_KINDS,
  MECHANISM_KINDS,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type DesignBrief,
  type FlowBinding,
  type MechanismClaim,
  type NfrBinding,
  type NodeKind,
} from '@sysdesign/contracts';

/**
 * Pure rules for a brief being drafted in the editor.
 *
 * The API rejects an IMPOSSIBLE brief and grades an UNSUPPORTED one, and the
 * editor has to respect both halves of that line: it must be structurally
 * incapable of producing a rejection, and it must never block a claim the
 * canvas simply fails to back up — that claim is the lesson.
 *
 * So every rejectable shape is prevented here rather than validated: the node
 * picker only offers eligible kinds, the flow builder only offers hops that
 * connect, and `reconcileBrief` is the one place a draft becomes a payload —
 * dropping anything the canvas no longer supports, because a node can be
 * deleted long after it was bound.
 */

/**
 * Nodes a claim may legally name. `MECHANISM_KINDS` is declared `as const`, so
 * the widening annotation is load-bearing — without it the tuple's literal
 * element type rejects a general `NodeKind`.
 */
export function eligibleNodes(graph: CanvasGraph, mechanism: MechanismClaim): CanvasNode[] {
  const kinds: readonly NodeKind[] = MECHANISM_KINDS[mechanism];
  return graph.nodes.filter((node) => kinds.includes(node.kind));
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

/**
 * Whether the walk both starts at a client and ends somewhere a request comes
 * to rest — the shape `exp.brf.flows-traced` credits. Read from the shared
 * vocabulary so this cannot drift from the grade.
 */
export function flowIsComplete(graph: CanvasGraph, path: readonly string[]): boolean {
  const nodes = walkNodes(graph, path);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last || path.length === 0) return false;
  return first.kind === 'client' && FLOW_SINK_KINDS.includes(last.kind);
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
 * Null rather than an empty brief on purpose: `briefHasClaims` treats
 * `{nfrBindings: [], flows: []}` as no claims at all, so submitting one would
 * skip every brief expectation and score the dimension 0 — the same as silence,
 * but with a stored artifact implying otherwise.
 *
 * Everything here is a DROP, never a rejection. The canvas is edited long after
 * a binding is made, and an author who deletes a node should not be told their
 * brief is invalid — the claim about that node simply stops existing.
 */
export function reconcileBrief(
  bindings: readonly NfrBinding[],
  flows: readonly FlowBinding[],
  graph: CanvasGraph,
): DesignBrief | null {
  const nfrBindings = bindings
    .map((binding) => {
      const kinds: readonly NodeKind[] = MECHANISM_KINDS[binding.mechanism];
      const kept = [...new Set(binding.nodeIds)]
        .filter((id) => {
          const node = graph.nodes.find((candidate) => candidate.id === id);
          return node !== undefined && kinds.includes(node.kind);
        })
        .slice(0, BINDING_MAX_NODES);
      return { ...binding, nodeIds: kept };
    })
    // A binding naming nothing is not a modest claim, it is an empty one — and
    // it grades as an unbacked binding, so emitting it only self-harms.
    .filter((binding) => binding.nodeIds.length > 0)
    .slice(0, BRIEF_MAX_NFR_BINDINGS);

  const keptFlows = flows
    .map((flow) => ({ ...flow, path: validPrefix(graph, flow.path) }))
    .filter((flow) => flow.path.length > 0)
    .slice(0, BRIEF_MAX_FLOWS);

  if (nfrBindings.length === 0 && keptFlows.length === 0) return null;
  return { version: DESIGN_BRIEF_VERSION, nfrBindings, flows: keptFlows };
}

/** Stable and unique without a clock: one flow per functional requirement. */
export function flowIdFor(requirementIndex: number): string {
  return `flow-${requirementIndex}`;
}

/** Ids referenced by any binding or flow — what the brief accounts for. */
export function accountedNodeIds(brief: DesignBrief | null, graph: CanvasGraph): Set<string> {
  const accounted = new Set<string>();
  if (!brief) return accounted;
  for (const binding of brief.nfrBindings) for (const id of binding.nodeIds) accounted.add(id);
  for (const flow of brief.flows) {
    for (const node of walkNodes(graph, flow.path)) accounted.add(node.id);
  }
  return accounted;
}

export { FLOW_SINK_KINDS };
