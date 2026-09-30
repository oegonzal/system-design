import {
  BINDING_CLAIM_MAX_LENGTH,
  BINDING_MAX_NODES,
  BRIEF_MAX_BINDINGS,
  FLOW_MAX_STEPS,
} from './canvas';
import {
  DESIGN_BRIEF_VERSION,
  type Binding,
  type CanvasGraph,
  type DesignBrief,
} from './canvas.schema';
import type { CriterionRef } from './brief-validator';

/**
 * The repair of a brief — the drop-side twin of `validateBriefReferences`.
 *
 * The validator names what is IMPOSSIBLE (a criterion the rubric never
 * listed, a node that is not on the canvas, a path that does not connect);
 * this file removes exactly that and nothing else, so what comes out passes
 * the validator and what was merely UNSUPPORTED — a claim the diagram does
 * not back — survives to be graded. Two callers share it: the editor, where a
 * draft becomes a payload long after a node was bound and deleted, and the
 * canvas pipeline, where a coach revision is repaired before the loop's
 * `references` validator reads it. Everything here is a DROP, never a
 * rejection.
 */

/** The longest prefix of `path` that is still a connected walk of real edges. */
export function validPrefix(graph: CanvasGraph, path: readonly string[]): string[] {
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
 * The bindings as a payload, or `null` when there is nothing worth sending.
 *
 * Null rather than an empty brief on purpose: the lenses read "no brief" as
 * exactly that, while a stored `{ bindings: [] }` would imply the author
 * chose to bind nothing.
 *
 * A binding is kept only when the validator would accept it: a criterion the
 * rubric lists, a claim, at least one component still on the canvas, and a
 * path that is a connected walk (truncated at the first hop that no longer
 * connects). The first binding per criterion wins; the rest are duplicates.
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
