/**
 * Shared grounding for every graded producer (critic, narrative, depth,
 * workability, scenarios). A lens may ground a weakness only to a requirement
 * the prompt actually made and a component the canvas actually has — so every
 * producer builds its schema against the SAME id vocabularies here and
 * re-checks the model's output against them before emitting. Ids in, ids out:
 * no prose ever reaches the engine's scorer.
 */
import {
  AXIS_FACTOR_LEVELS,
  type AxisFactorLevel,
  type CanvasGraph,
  type EvalDimension,
  type Severity,
  type WorkflowSpec,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { GradedEvidenceItem } from '../core/artifacts';
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
 * The requirement vocabulary a lens may ground to: the NFRs plus, on a
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
 * The ordinal half every graded weakness carries, as the model reports it —
 * the magnitude and confidence the engine prices, grounded to a requirement and
 * components. One declaration, spread into each producer's item schema, so the
 * currency is identical across lenses.
 */
export interface GradedWeaknessRaw {
  weakness: AxisFactorLevel;
  confidence: AxisFactorLevel;
  requirementId: string | null;
  affectedComponents: string[];
}

/**
 * The zod shape of `GradedWeaknessRaw`, built per request: `requirementId` is a
 * `z.enum` over THIS prompt's requirements and `affectedComponents` over THIS
 * canvas's nodes — grounding the model cannot escape. When there is nothing to
 * lock to, the field degrades to null / an empty list rather than inventing an
 * enum.
 */
export function gradedWeaknessShape(graph: CanvasGraph, facts: PromptFacts) {
  const reqTuple = enumTuple(requirementIds(facts));
  const nodeTuple = enumTuple(graph.nodes.map((node) => node.id));
  return {
    weakness: z
      .enum(AXIS_FACTOR_LEVELS)
      .describe(
        'How badly this hurts the design at the stated scale — the magnitude the engine scores. none = not really a weakness.',
      ),
    confidence: z
      .enum(AXIS_FACTOR_LEVELS)
      .describe('How sure you are this is a real weakness, not a matter of taste.'),
    requirementId: (reqTuple ? z.enum(reqTuple).nullable() : z.null()).describe(
      'The prompt requirement (an NFR or workflow item id) this weakens; null only when the weakness is genuinely cross-cutting.',
    ),
    affectedComponents: (nodeTuple
      ? z.array(z.enum(nodeTuple)).max(20)
      : z.array(z.string()).max(0)
    ).describe('Ids of existing canvas nodes this concerns. Empty if graph-wide.'),
  };
}

/** The admissible id sets a producer re-checks the model's output against. */
export function groundingSets(
  graph: CanvasGraph,
  facts: PromptFacts,
): { requirements: ReadonlySet<string>; nodes: ReadonlySet<string> } {
  return { requirements: new Set(requirementIds(facts)), nodes: nodeIdSet(graph) };
}

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

/**
 * A reported weakness → the graded item the engine scores. The lens supplies
 * the dimension it lands on (its own judgement, or its fixed lens dimension),
 * the display severity, and the prose; grounding is re-checked here.
 */
export function toGradedItem(
  raw: GradedWeaknessRaw,
  detail: { dimension: EvalDimension; severity: Severity; rationale: string },
  known: { requirements: ReadonlySet<string>; nodes: ReadonlySet<string> },
): GradedEvidenceItem {
  const grounding = admitGrounding(
    raw.requirementId,
    raw.affectedComponents,
    known.requirements,
    known.nodes,
  );
  return {
    dimension: detail.dimension,
    level: raw.weakness,
    confidence: raw.confidence,
    severity: detail.severity,
    requirementId: grounding.requirementId,
    affectedNodeIds: grounding.affectedNodeIds,
    rationale: detail.rationale,
    suggestion: null,
  };
}

export function nodeIdSet(graph: CanvasGraph): Set<string> {
  return new Set(graph.nodes.map((node) => node.id));
}
