import type { ActionDeps } from './history';
import type { CanvasState } from './state';

export type NarrativeActions = Pick<
  CanvasState,
  'setNarrativeOverview' | 'setComponentRationale' | 'setCriterionNarration' | 'loadNarrative'
>;

/** The narrative the author writes beside the diagram: an overview, a rationale per block, a narration per criterion. */
export const narrativeActions = ({
  set,
  get,
  edits: { commit, loaded },
}: ActionDeps): NarrativeActions => ({
  setNarrativeOverview(text) {
    commit({ narrativeOverview: text }, 'narrative:overview');
  },

  setComponentRationale(nodeId, prose) {
    const { componentRationales } = get();
    const others = componentRationales.filter((rationale) => rationale.nodeId !== nodeId);
    // Empty prose is a cleared slot, not a stored empty one.
    commit(
      {
        componentRationales: prose.trim() === '' ? others : [...others, { nodeId, prose }],
      },
      `narrative:rationale:${nodeId}`,
    );
  },

  setCriterionNarration(criterionId, prose) {
    const { criterionNarrations } = get();
    const others = criterionNarrations.filter((narration) => narration.criterionId !== criterionId);
    commit(
      {
        criterionNarrations: prose.trim() === '' ? others : [...others, { criterionId, prose }],
      },
      `narrative:narration:${criterionId}`,
    );
  },

  loadNarrative(narrative) {
    set(
      loaded({
        narrativeOverview: narrative?.overview ?? '',
        componentRationales: narrative?.componentRationales ?? [],
        criterionNarrations: narrative?.criterionNarrations ?? [],
      }),
    );
  },
});
