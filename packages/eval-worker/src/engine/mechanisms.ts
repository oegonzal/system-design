import {
  judgeMechanism,
  type DesignBrief,
  type MechanismGraph,
  type MechanismVerdict,
  type NfrBinding,
} from '@sysdesign/contracts';

import type { GraphIndex } from './graph-index';

/**
 * The engine's side of corroboration.
 *
 * The predicates themselves live in contracts (`lib/mechanisms.ts`) so the
 * brief editor and the score are the same code. All this module does is hand
 * them a `MechanismGraph` backed by the index the engine already built, and
 * fold the per-binding verdicts into one pass over the brief.
 */

/** Wraps the memoized index in the narrow port the predicates ask for. */
export function mechanismGraphOf(index: GraphIndex): MechanismGraph {
  return {
    nodes: index.nodes(),
    edges: index.edges(),
    reaches: (fromId, toId) => index.pathExists(fromId, toId),
  };
}

export interface BindingVerdict extends MechanismVerdict {
  binding: NfrBinding;
}

/**
 * Every binding judged once. Both the expectation bank and the rule pack read
 * this, so a claim can never be credited by one and charged by the other.
 */
export function judgeBrief(index: GraphIndex, brief: DesignBrief | null): BindingVerdict[] {
  if (brief === null) return [];
  const graph = mechanismGraphOf(index);
  return brief.nfrBindings.map((binding) => ({
    binding,
    ...judgeMechanism(graph, binding.mechanism, binding.nodeIds),
  }));
}

/** Bindings whose named components the diagram actually backs up. */
export function corroboratedBindings(verdicts: readonly BindingVerdict[]): BindingVerdict[] {
  return verdicts.filter((verdict) => verdict.corroborated.length > 0);
}

/**
 * Node ids a corroborated binding vouches for. Membership in an UNcorroborated
 * binding deliberately does not count — otherwise naming every node in every
 * binding would account for the whole canvas for free.
 */
export function bindingBackedNodeIds(verdicts: readonly BindingVerdict[]): Set<string> {
  return new Set(corroboratedBindings(verdicts).flatMap((verdict) => verdict.corroborated));
}

/** Node ids any traced flow passes through, as endpoints of its edges. */
export function flowTouchedNodeIds(index: GraphIndex, brief: DesignBrief | null): Set<string> {
  const touched = new Set<string>();
  if (brief === null) return touched;
  for (const flow of brief.flows) {
    for (const edgeId of flow.path) {
      const edge = index.edges().find((candidate) => candidate.id === edgeId);
      if (edge === undefined) continue;
      touched.add(edge.source);
      touched.add(edge.target);
    }
  }
  return touched;
}
