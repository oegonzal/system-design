/**
 * Pure rules for a narrative being drafted in the editor — the prose sibling of
 * `brief-draft.ts`.
 *
 * The narrative is authored as reference-anchored slots: an overview, a
 * rationale per component (keyed to a node id) and a narration per criterion
 * (keyed to its id). `reconcileNarration` (in `@sysdesign/contracts`, shared
 * with the quality loop's canvas pipeline) is the one place a draft becomes a
 * payload — dropping a rationale for a node the canvas no longer has and a
 * narration for a criterion the prompt never derived, exactly as
 * `reconcileBrief` drops a binding whose node was deleted, because a canvas
 * edit must never make the API reject what the author wrote.
 *
 * Thinness is never judged here. Whether a rationale explains anything is the
 * explanation critic's call; the editor only knows written from unwritten.
 */

export type NarrationSlotState = 'empty' | 'filled';

export function narrationSlotState(prose: string): NarrationSlotState {
  return prose.trim().length === 0 ? 'empty' : 'filled';
}
