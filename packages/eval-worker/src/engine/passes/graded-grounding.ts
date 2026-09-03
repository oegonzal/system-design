/**
 * Shared grounding for the graded producers (the critic and the workability
 * evaluator). A lens may ground a weakness only to a requirement the prompt
 * actually made and a component the canvas actually has — so every producer
 * builds its schema against the SAME id vocabularies here and re-checks the
 * model's output against them before emitting. Ids in, ids out: no prose ever
 * reaches the engine's scorer.
 */
import type { AxisFactorLevel, CanvasGraph, Severity, WorkflowSpec } from '@sysdesign/contracts';

import type { PromptFacts } from '../types';

/** Every workflow item a lens can name — operations, events, ingests, aggregations, entities. */
export function workflowItemIds(spec: WorkflowSpec): string[] {
  return [
    ...spec.operations.map((op) => op.id),
    ...spec.events.map((event) => event.id),
    ...spec.ingests.map((ingest) => ingest.id),
    ...spec.aggregations.map((agg) => agg.id),
    ...spec.entities.map((entity) => entity.id),
  ];
}

/**
 * The requirement vocabulary a critic may ground to: the NFRs plus, on a
 * workflow prompt, the workflow items. Both appear verbatim in the design text
 * the model reads (`describeDesign`), so a `z.enum` over them locks grounding to
 * ids the model has actually seen. Functional requirements are deliberately
 * excluded — the prompt states them as prose with no stable per-item id, so an
 * ordinal would invite guessed grounding, the opposite of the goal.
 */
export function requirementIds(facts: PromptFacts): string[] {
  const ids = [
    ...facts.nfrs.map((nfr) => nfr.id),
    ...(facts.workflow ? workflowItemIds(facts.workflow) : []),
  ];
  return [...new Set(ids)];
}

/** Non-empty tuple for `z.enum`, or null when there is nothing to lock to. */
export function enumTuple(ids: readonly string[]): [string, ...string[]] | null {
  return ids.length === 0 ? null : (ids as [string, ...string[]]);
}

/** Severity is display/persistence only; derive it from the weakness magnitude. */
export const SEVERITY_FROM_LEVEL: Record<AxisFactorLevel, Severity> = {
  none: 'info',
  low: 'low',
  medium: 'medium',
  high: 'high',
};

/**
 * The admissibility re-check every producer runs on the model's output: drop a
 * weakness whose requirement or components the prompt/canvas does not have (the
 * enum should already prevent it; this is the defense-in-depth the suggestion
 * pipeline runs too), and keep only real component ids.
 */
export function admitGrounding(
  requirementId: string | null,
  affectedNodeIds: readonly string[],
  knownRequirements: ReadonlySet<string>,
  knownNodes: ReadonlySet<string>,
): { requirementId: string | null; affectedNodeIds: string[] } {
  return {
    requirementId:
      requirementId !== null && knownRequirements.has(requirementId) ? requirementId : null,
    affectedNodeIds: affectedNodeIds.filter((id) => knownNodes.has(id)),
  };
}

export function nodeIdSet(graph: CanvasGraph): Set<string> {
  return new Set(graph.nodes.map((node) => node.id));
}
