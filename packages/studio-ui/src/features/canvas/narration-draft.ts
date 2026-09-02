import {
  NARRATION_MAX_COMPONENT_RATIONALES,
  NARRATION_MAX_FLOW_NARRATIONS,
  NARRATION_OVERVIEW_MAX_LENGTH,
  NARRATION_PROSE_MAX_LENGTH,
  NARRATION_VERSION,
  readsAsProse,
  type CanvasGraph,
  type ComponentRationale,
  type DesignNarrative,
  type FlowNarration,
} from '@sysdesign/contracts';

/**
 * Pure rules for a narrative being drafted in the editor — the prose sibling of
 * `brief-draft.ts`.
 *
 * The narrative is authored as reference-anchored slots: an overview, a
 * rationale per component (keyed to a node id) and a narration per functional
 * requirement (keyed to an ordinal). `reconcileNarration` is the one place a
 * draft becomes a payload — dropping a rationale for a node the canvas no longer
 * has, exactly as `reconcileBrief` drops a binding whose node was deleted,
 * because a canvas edit must never make the API reject what the author wrote.
 *
 * Thinness is never dropped here. A two-word rationale is a real slot that
 * grades poorly, not an empty one — the grade decides substance (via
 * `readsAsProse`), the editor only strips slots with no prose at all.
 */

/** How a slot reads to the grade, computed live so the author sees what it will earn. */
export type NarrationSlotState = 'empty' | 'thin' | 'explained';

/**
 * The live verdict on one slot's prose. `explained` is exactly what
 * `projectNarration` will count; `thin` is present-but-insubstantial (written,
 * but below the prose gate); `empty` is nothing typed.
 */
export function narrationSlotState(prose: string): NarrationSlotState {
  if (prose.trim().length === 0) return 'empty';
  return readsAsProse(prose) ? 'explained' : 'thin';
}

/**
 * The draft as a payload, or `null` when there is nothing worth sending.
 *
 * Null rather than an empty narrative on purpose: `narrationHasClaims` treats a
 * narrative with no substantive slot as no claims at all, so submitting one
 * would grade exactly like silence but leave a stored artifact implying
 * otherwise — the same trap `reconcileBrief` avoids.
 *
 * Everything here is a DROP, never a rejection: a rationale for a deleted node
 * stops existing, an empty-prose slot is left out, and the caps mirror the DTO's
 * so a draft can never grow into a shape the API would refuse.
 */
export function reconcileNarration(
  overview: string,
  rationales: readonly ComponentRationale[],
  flows: readonly FlowNarration[],
  graph: CanvasGraph,
): DesignNarrative | null {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  const seenNodes = new Set<string>();
  const componentRationales = rationales
    .map((rationale) => ({
      nodeId: rationale.nodeId,
      prose: rationale.prose.trim().slice(0, NARRATION_PROSE_MAX_LENGTH),
    }))
    .filter((rationale) => {
      if (rationale.prose.length === 0 || !nodeIds.has(rationale.nodeId)) return false;
      if (seenNodes.has(rationale.nodeId)) return false;
      seenNodes.add(rationale.nodeId);
      return true;
    })
    .slice(0, NARRATION_MAX_COMPONENT_RATIONALES);

  const seenRequirements = new Set<number>();
  const flowNarrations = flows
    .map((flow) => ({
      requirementIndex: flow.requirementIndex,
      prose: flow.prose.trim().slice(0, NARRATION_PROSE_MAX_LENGTH),
    }))
    .filter((flow) => {
      if (flow.prose.length === 0 || flow.requirementIndex < 0) return false;
      if (seenRequirements.has(flow.requirementIndex)) return false;
      seenRequirements.add(flow.requirementIndex);
      return true;
    })
    .slice(0, NARRATION_MAX_FLOW_NARRATIONS);

  const trimmedOverview = overview.trim().slice(0, NARRATION_OVERVIEW_MAX_LENGTH);

  if (
    trimmedOverview.length === 0 &&
    componentRationales.length === 0 &&
    flowNarrations.length === 0
  ) {
    return null;
  }

  return {
    version: NARRATION_VERSION,
    ...(trimmedOverview.length > 0 ? { overview: trimmedOverview } : {}),
    componentRationales,
    flowNarrations,
  };
}
